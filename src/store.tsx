import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createSession, encryptJSON, unlock, type EncryptedBlob, type Session } from './lib/crypto';
import { loadVault, saveVault, wipeVault } from './lib/storage';
import type { AppData } from './lib/types';

type Status = 'loading' | 'new' | 'locked' | 'ready';

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
  const session = useRef<Session | null>(null);
  const saveTimer = useRef<number>(undefined);

  useEffect(() => {
    loadVault()
      .then((b) => setStatus(b ? 'locked' : 'new'))
      .catch(() => setStatus('new'));
  }, []);

  const persist = useCallback((d: AppData) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (session.current) await saveVault(await encryptJSON(session.current, d));
    }, 300);
  }, []);

  const update = useCallback(
    (fn: (d: AppData) => AppData) =>
      setData((prev) => {
        const next = fn(prev);
        persist(next);
        return next;
      }),
    [persist],
  );

  const lock = useCallback(() => {
    session.current = null;
    setData(null as unknown as AppData);
    setStatus('locked');
  }, []);

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
    async create(passphrase, initial) {
      session.current = await createSession(passphrase);
      await saveVault(await encryptJSON(session.current, initial));
      setData(initial);
      setStatus('ready');
    },
    async open(passphrase) {
      const blob = await loadVault();
      if (!blob) return false;
      try {
        const r = await unlock<AppData>(passphrase, blob);
        session.current = r.session;
        setData(r.value);
        setStatus('ready');
        return true;
      } catch {
        return false;
      }
    },
    async changePassphrase(next) {
      session.current = await createSession(next);
      await saveVault(await encryptJSON(session.current, data));
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
        setData(r.value);
        setStatus('ready');
        return true;
      } catch {
        return false;
      }
    },
    async wipe() {
      await wipeVault();
      session.current = null;
      setData(null as unknown as AppData);
      setStatus('new');
    },
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
