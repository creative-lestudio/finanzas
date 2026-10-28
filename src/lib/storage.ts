import type { EncryptedBlob } from './crypto';

// Almacén local en IndexedDB. Solo guarda blobs cifrados: nada sale del
// dispositivo salvo que el usuario exporte una copia o active la sincronización.
//   data → tus datos actuales
//   base → la última versión sincronizada (para fusionar cambios de otros dispositivos)
//   meta → versión remota conocida (no es secreta)

const DB = 'finanzas';
const STORE = 'vault';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export interface SyncMeta {
  version: number;
  userId: string;
  lastSync: string;
}

// Los datos se guardan en IndexedDB y, además, en una copia espejo en localStorage: si el
// navegador falla o bloquea uno de los dos (pasa en iOS y en vistas incrustadas), el otro respalda.
const MIRROR_KEY = 'finanzas.vault';

function readMirror(): EncryptedBlob | undefined {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? (JSON.parse(raw) as EncryptedBlob) : undefined;
  } catch {
    return undefined;
  }
}

function writeMirror(blob: EncryptedBlob | null): boolean {
  try {
    if (blob) localStorage.setItem(MIRROR_KEY, JSON.stringify(blob));
    else localStorage.removeItem(MIRROR_KEY);
    return true;
  } catch {
    return false; // sin espacio o bloqueado: no es crítico mientras IndexedDB funcione
  }
}

const idbLoad = () => tx<EncryptedBlob | undefined>('readonly', (s) => s.get('data'));

/** Lee los datos. Lanza si el almacenamiento no responde (no es lo mismo que "no hay datos"). */
export async function loadVault(): Promise<EncryptedBlob | undefined> {
  let idbError: unknown;
  try {
    const b = await idbLoad();
    if (b) return b;
  } catch (e) {
    idbError = e;
  }
  const m = readMirror();
  if (m) return m;
  if (idbError) throw idbError;
  return undefined;
}

export async function saveVault(blob: EncryptedBlob): Promise<void> {
  let idbOk = true;
  let err: unknown;
  try {
    await tx<void>('readwrite', (s) => s.put(blob, 'data'));
  } catch (e) {
    idbOk = false;
    err = e;
  }
  const mirrorOk = writeMirror(blob);
  if (!idbOk && !mirrorOk) throw err ?? new Error('El navegador no permite guardar datos.');
}
export const loadBase = () => tx<EncryptedBlob | undefined>('readonly', (s) => s.get('base'));
export const saveBase = (blob: EncryptedBlob) => tx<void>('readwrite', (s) => s.put(blob, 'base'));
export const loadMeta = () => tx<SyncMeta | undefined>('readonly', (s) => s.get('meta'));
export const saveMeta = (meta: SyncMeta) => tx<void>('readwrite', (s) => s.put(meta, 'meta'));
export const clearMeta = () => tx<void>('readwrite', (s) => s.delete('meta'));
export const wipeVault = async () => {
  writeMirror(null);
  await tx<void>('readwrite', (s) => s.clear());
};

// Copias automáticas locales: "backup:<fecha ISO>" → blob cifrado. Protegen de cualquier
// error de guardado o de sincronización: siempre queda la versión anterior.
const BACKUP_PREFIX = 'backup:';

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore, done: (v: T) => void, fail: (e: unknown) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    fn(t.objectStore(STORE), resolve, reject);
    t.onerror = () => reject(t.error);
  }).finally(() => db.close());
}

export const saveBackup = (blob: EncryptedBlob, stamp = new Date().toISOString()) => tx<void>('readwrite', (s) => s.put(blob, BACKUP_PREFIX + stamp));

export async function listBackupStamps(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>('readonly', (s, done, fail) => {
    const r = s.getAllKeys();
    r.onsuccess = () => done(r.result);
    r.onerror = () => fail(r.error);
  });
  return keys.map(String).filter((k) => k.startsWith(BACKUP_PREFIX)).map((k) => k.slice(BACKUP_PREFIX.length)).sort().reverse();
}

export const loadBackup = (stamp: string) => tx<EncryptedBlob | undefined>('readonly', (s) => s.get(BACKUP_PREFIX + stamp));
export const deleteBackup = (stamp: string) => tx<void>('readwrite', (s) => s.delete(BACKUP_PREFIX + stamp));

export async function pruneBackups(keep: number): Promise<void> {
  for (const stamp of (await listBackupStamps()).slice(keep)) await deleteBackup(stamp);
}

/** Guarda tal cual (sin descifrar) un blob que se iba a perder, para poder recuperarlo después. */
export const saveRescue = (blob: EncryptedBlob, why: string) => tx<void>('readwrite', (s) => s.put(blob, `backup:${new Date().toISOString()}~${why}`));

export interface StorageReport {
  idb: 'ok' | string;
  mirror: boolean;
  persisted: boolean | null;
  quota?: { used: number; total: number };
  standalone: boolean;
  origin: string;
  hasVault: boolean;
  backups: number;
}

/** Diagnóstico del almacenamiento del dispositivo (para ver por qué algo no se conserva). */
export async function storageReport(): Promise<StorageReport> {
  let idb: StorageReport['idb'] = 'ok';
  let hasVault = false;
  try {
    await tx<void>('readwrite', (s) => s.put(Date.now(), 'probe'));
    await tx<void>('readwrite', (s) => s.delete('probe'));
    hasVault = Boolean(await idbLoad());
  } catch (e) {
    idb = (e as Error)?.message || 'error';
  }
  let persisted: boolean | null = null;
  let quota: StorageReport['quota'];
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) quota = { used: est.usage ?? 0, total: est.quota };
  } catch {
    /* no disponible */
  }
  return {
    idb,
    mirror: Boolean(readMirror()),
    persisted,
    quota,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    origin: location.origin + location.pathname,
    hasVault,
    backups: (await listBackupStamps().catch(() => [])).length,
  };
}
