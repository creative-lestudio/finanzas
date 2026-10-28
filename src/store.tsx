import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSession, decryptJSON, encryptJSON, unlock, type EncryptedBlob, type Session } from './lib/crypto';
import { migrate } from './lib/defaults';
import { setDefaultCurrency } from './lib/money';
import { clearMeta, listBackupStamps, loadBackup, loadBase, loadMeta, loadVault, saveBase, saveMeta, saveVault, wipeVault } from './lib/storage';
import { backupIfDue, countTx, requestPersistence, VaultWriter, type SaveState } from './lib/vault';
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
  /** Estado del guardado en este dispositivo. */
  save: SaveState;
  /** Copias automáticas locales (la más reciente primero). */
  listBackups: () => Promise<{ stamp: string; movements: number }[]>;
  restoreBackup: (stamp: string) => Promise<boolean>;
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
  const syncTimer = useRef<number>(undefined);
  const syncing = useRef<Promise<void> | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'saved' });
  const [writer] = useState(() => new VaultWriter(() => session.current, setSave));

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
    // Primero se termina de guardar lo pendiente; la clave se suelta después.
    const s = session.current;
    void writer.flush().finally(() => {
      if (session.current === s) session.current = null;
      writer.reset();
    });
    dataRef.current = null;
    baseRef.current = null;
    setData(null as unknown as AppData);
    setStatus('locked');
  }, [writer]);

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
        await writer.flush(); // lo local queda a salvo en disco antes de tocar nada
        const r = await syncOnce(sb, s, local, { version: versionRef.current, base: baseRef.current });
        // Si mientras tanto hubo cambios locales, se conservan y se suben en el siguiente ciclo.
        const changedMeanwhile = dataRef.current !== local;
        if (!changedMeanwhile && r.data !== local) {
          // Antes de reemplazar lo local por lo fusionado, copia de seguridad.
          await backupIfDue(await encryptJSON(s, local), true).catch(() => undefined);
          adopt(r.data);
          writer.set(r.data);
        }
        baseRef.current = r.data;
        versionRef.current = r.version;
        const now = new Date().toISOString();
        await saveBase(await encryptJSON(s, r.data));
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
  }, [adopt, lock, writer]);

  const persist = useCallback(
    (d: AppData) => {
      writer.set(d);
      window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => void runSync(), 2500);
    },
    [runSync, writer],
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

  // Al salir o ocultar la app se fuerza el guardado inmediato.
  useEffect(() => {
    const flush = () => void writer.flush();
    const vis = () => document.hidden && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [writer]);

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
      void requestPersistence();
      adopt(d);
      setStatus('ready');
    },
    async open(passphrase) {
      const blob = await loadVault();
      if (!blob) return false;
      try {
        const r = await unlock<AppData>(passphrase, blob);
        session.current = r.session;
        void backupIfDue(blob).catch(() => undefined);
        void requestPersistence();
        adopt(migrate(r.value));
        setStatus('ready');
        void afterUnlock(r.session);
        return true;
      } catch {
        return false;
      }
    },
    async changePassphrase(next) {
      await writer.flush();
      await backupIfDue(await encryptJSON(session.current!, data), true).catch(() => undefined);
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
      writer.reset();
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
          setSync({ status: 'error', error: 'Ya hay datos en tu cuenta cifrados con otra contraseña. Cierra sesión y usa «Ya tengo datos guardados en mi cuenta».' });
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
    save,
    async listBackups() {
      const s = session.current;
      if (!s) return [];
      const out: { stamp: string; movements: number }[] = [];
      for (const stamp of await listBackupStamps()) {
        const blob = await loadBackup(stamp);
        if (!blob) continue;
        try {
          out.push({ stamp, movements: countTx(migrate(await decryptJSON<AppData>(s, blob))) });
        } catch {
          /* copia con otra clave: no se puede leer desde aquí */
        }
      }
      return out;
    },
    async restoreBackup(stamp) {
      const s = session.current;
      const blob = await loadBackup(stamp);
      if (!s || !blob || !dataRef.current) return false;
      try {
        const d = migrate(await decryptJSON<AppData>(s, blob));
        await backupIfDue(await encryptJSON(s, dataRef.current), true).catch(() => undefined);
        const next = { ...d, updatedAt: new Date().toISOString() };
        adopt(next);
        persist(next);
        return true;
      } catch {
        return false;
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
