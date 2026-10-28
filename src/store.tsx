import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSession, decryptJSON, encryptJSON, unlock, type EncryptedBlob, type Session } from './lib/crypto';
import { migrate } from './lib/defaults';
import { setDefaultCurrency } from './lib/money';
import { clearMeta, loadBase, loadMeta, loadVault, saveBase, saveMeta, saveVault, wipeVault } from './lib/storage';
import { fetchRemote, PassphraseMismatch, supabase, syncOnce, watchRemote } from './lib/sync';
import { applyTheme } from './lib/theme';
import type { AppData } from './lib/types';

type Status = 'loading' | 'new' | 'locked' | 'ready';
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface Store {
  status: Status;
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  create: (passphrase: string, initial: AppData) => Promise<void>;
  open: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  changePassphrase: (next: string) => Promise<void>;
  exportBackup: () => Promise<EncryptedBlob>;
  importBackup: (blob: EncryptedBlob, passphrase: string) => Promise<boolean>;
  wipe: () => Promise<void>;
  sync: { status: SyncStatus; lastSync?: string; error?: string; userEmail?: string };
  syncNow: () => Promise<void>;
  /** Vincula este dispositivo a la nube (ya con sesión iniciada en Supabase). */
  linkCloud: (passphrase: string) => Promise<'linked' | 'wrong-passphrase'>;
  /** Primer arranque en un dispositivo nuevo: descarga y descifra tus datos de la nube. */
  restoreFromCloud: (passphrase: string) => Promise<'ok' | 'empty' | 'wrong-passphrase'>;
  unlinkCloud: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store fuera de contexto');
  return s;
};

/** Bloqueo automático tras 5 minutos sin actividad o al ocultar la app más de 1 minuto. */
const IDLE_MS = 5 * 60_000;
const HIDDEN_MS = 60_000;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<AppData>(null as unknown as AppData);
  const [sync, setSync] = useState<Store['sync']>({ status: 'off' });
  const session = useRef<Session | null>(null);
  const dataRef = useRef<AppData | null>(null);
  const baseRef = useRef<AppData | null>(null);
  const versionRef = useRef(0);
  const saveTimer = useRef<number>(undefined);
  const syncTimer = useRef<number>(undefined);
  const syncing = useRef<Promise<void> | null>(null);

  useEffect(() => {
    loadVault()
      .then((b) => setStatus(b ? 'locked' : 'new'))
      .catch(() => setStatus('new'));
  }, []);

  const adopt = useCallback((d: AppData) => {
    dataRef.current = d;
    setDefaultCurrency(d.settings.currency);
    applyTheme(d.settings.theme);
    setData(d);
  }, []);

  const lock = useCallback(() => {
    session.current = null;
    dataRef.current = null;
    baseRef.current = null;
    setData(null as unknown as AppData);
    setStatus('locked');
  }, []);

  const runSync = useCallback(async () => {
    if (syncing.current) return syncing.current;
    const sb = supabase();
    const s = session.current;
    const local = dataRef.current;
    if (!sb || !s || !local) return;
    const meta = await loadMeta();
    if (!meta) return; // este dispositivo no está vinculado
    const { data: auth } = await sb.auth.getSession();
    if (!auth.session) {
      setSync({ status: 'error', error: 'Inicia sesión de nuevo para sincronizar.' });
      return;
    }
    setSync((x) => ({ ...x, status: 'syncing', userEmail: auth.session!.user.email }));
    syncing.current = (async () => {
      try {
        const r = await syncOnce(sb, s, local, { version: versionRef.current, base: baseRef.current });
        // Si mientras tanto hubo cambios locales, se conservan y se suben en el siguiente ciclo.
        const changedMeanwhile = dataRef.current !== local;
        if (!changedMeanwhile && r.data !== local) adopt(r.data);
        baseRef.current = r.data;
        versionRef.current = r.version;
        const now = new Date().toISOString();
        await saveBase(await encryptJSON(s, r.data));
        if (!changedMeanwhile) await saveVault(await encryptJSON(s, r.data));
        await saveMeta({ version: r.version, userId: meta.userId, lastSync: now });
        setSync({ status: 'idle', lastSync: now, userEmail: auth.session!.user.email });
        if (changedMeanwhile) syncTimer.current = window.setTimeout(() => void runSync(), 1500);
      } catch (e) {
        if (e instanceof PassphraseMismatch) {
          // La contraseña cambió en otro dispositivo: se adopta la copia remota y se pide la nueva.
          await saveVault(e.blob);
          lock();
          setSync({ status: 'error', error: 'Tu contraseña cambió en otro dispositivo. Introduce la nueva.' });
        } else setSync((x) => ({ ...x, status: 'error', error: (e as Error).message }));
      } finally {
        syncing.current = null;
      }
    })();
    return syncing.current;
  }, [adopt, lock]);

  const persist = useCallback(
    (d: AppData) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        if (session.current) await saveVault(await encryptJSON(session.current, d));
      }, 300);
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => void runSync(), 2500);
    },
    [runSync],
  );

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      const prev = dataRef.current;
      if (!prev) return;
      const next = { ...fn(prev), updatedAt: new Date().toISOString() };
      adopt(next);
      persist(next);
    },
    [adopt, persist],
  );

  // Cargar estado de sincronización al desbloquear.
  const afterUnlock = useCallback(async (s: Session) => {
    const meta = await loadMeta();
    if (!meta) {
      setSync({ status: 'off' });
      return;
    }
    versionRef.current = meta.version;
    const baseBlob = await loadBase();
    const base = baseBlob ? await decryptJSON<AppData>(s, baseBlob).catch(() => null) : null;
    baseRef.current = base ? migrate(base) : null;
    setSync({ status: 'idle', lastSync: meta.lastSync });
    void runSync();
  }, [runSync]);

  // Sincronizar al volver a la app y cuando otro dispositivo sube cambios.
  const linked = sync.status !== 'off';
  useEffect(() => {
    if (status !== 'ready' || !linked) return;
    const sb = supabase();
    let stop = () => {};
    void sb?.auth.getUser().then(({ data: u }) => {
      if (u.user) stop = watchRemote(sb, u.user.id, () => void runSync());
    });
    const onVis = () => !document.hidden && void runSync();
    document.addEventListener('visibilitychange', onVis);
    const poll = window.setInterval(() => void runSync(), 60_000);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(poll);
    };
  }, [status, linked, runSync]);

  useEffect(() => {
    if (status !== 'ready') return;
    let idle = window.setTimeout(lock, IDLE_MS);
    let hiddenAt = 0;
    const bump = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(lock, IDLE_MS);
    };
    const vis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_MS) lock();
    };
    const evs = ['pointerdown', 'keydown', 'scroll'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearTimeout(idle);
      evs.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener('visibilitychange', vis);
    };
  }, [status, lock]);

  const store: Store = {
    status,
    data,
    update,
    lock,
    sync,
    syncNow: runSync,
    async create(passphrase, initial) {
      session.current = await createSession(passphrase);
      const d = migrate(initial);
      await saveVault(await encryptJSON(session.current, d));
      adopt(d);
      setStatus('ready');
    },
    async open(passphrase) {
      const blob = await loadVault();
      if (!blob) return false;
      try {
        const r = await unlock<AppData>(passphrase, blob);
        session.current = r.session;
        adopt(migrate(r.value));
        setStatus('ready');
        void afterUnlock(r.session);
        return true;
      } catch {
        return false;
      }
    },
    async changePassphrase(next) {
      session.current = await createSession(next);
      await saveVault(await encryptJSON(session.current, data));
      if (baseRef.current) await saveBase(await encryptJSON(session.current, baseRef.current));
      // Fuerza a subir la copia con la nueva clave.
      if (baseRef.current) baseRef.current = { ...baseRef.current, updatedAt: 'cambio-de-clave' };
      void runSync();
    },
    async exportBackup() {
      if (!session.current) throw new Error('Bloqueado');
      return encryptJSON(session.current, data);
    },
    async importBackup(blob, passphrase) {
      try {
        const r = await unlock<AppData>(passphrase, blob);
        session.current = r.session;
        await saveVault(blob);
        adopt(migrate(r.value));
        setStatus('ready');
        return true;
      } catch {
        return false;
      }
    },
    async wipe() {
      await wipeVault();
      await supabase()?.auth.signOut();
      session.current = null;
      dataRef.current = null;
      setData(null as unknown as AppData);
      setSync({ status: 'off' });
      setStatus('new');
    },
    async linkCloud(passphrase) {
      const sb = supabase();
      const { data: u } = (await sb?.auth.getUser()) ?? { data: { user: null } };
      if (!sb || !u.user) throw new Error('Inicia sesión primero.');
      const remote = await fetchRemote(sb);
      if (remote) {
        // Todos los dispositivos comparten la misma sal: así una sola contraseña abre los datos en todos.
        try {
          const r = await unlock<AppData>(passphrase, remote.blob);
          session.current = r.session;
        } catch {
          return 'wrong-passphrase';
        }
      } else {
        try {
          await unlock(passphrase, (await loadVault())!);
        } catch {
          return 'wrong-passphrase';
        }
      }
      versionRef.current = 0;
      baseRef.current = null;
      await saveVault(await encryptJSON(session.current!, dataRef.current));
      await saveMeta({ version: 0, userId: u.user.id, lastSync: '' });
      setSync({ status: 'idle', userEmail: u.user.email });
      await runSync();
      return 'linked';
    },
    async restoreFromCloud(passphrase) {
      const sb = supabase();
      const { data: u } = (await sb?.auth.getUser()) ?? { data: { user: null } };
      if (!sb || !u.user) throw new Error('Inicia sesión primero.');
      const remote = await fetchRemote(sb);
      if (!remote) return 'empty';
      try {
        const r = await unlock<AppData>(passphrase, remote.blob);
        session.current = r.session;
        const d = migrate(r.value);
        await saveVault(remote.blob);
        await saveBase(remote.blob);
        await saveMeta({ version: remote.version, userId: u.user.id, lastSync: new Date().toISOString() });
        versionRef.current = remote.version;
        baseRef.current = d;
        adopt(d);
        setSync({ status: 'idle', lastSync: new Date().toISOString(), userEmail: u.user.email });
        setStatus('ready');
        return 'ok';
      } catch {
        return 'wrong-passphrase';
      }
    },
    async unlinkCloud() {
      await clearMeta();
      await supabase()?.auth.signOut();
      setSync({ status: 'off' });
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
