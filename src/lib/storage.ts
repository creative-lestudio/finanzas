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

export const loadVault = () => tx<EncryptedBlob | undefined>('readonly', (s) => s.get('data'));
export const saveVault = (blob: EncryptedBlob) => tx<void>('readwrite', (s) => s.put(blob, 'data'));
export const loadBase = () => tx<EncryptedBlob | undefined>('readonly', (s) => s.get('base'));
export const saveBase = (blob: EncryptedBlob) => tx<void>('readwrite', (s) => s.put(blob, 'base'));
export const loadMeta = () => tx<SyncMeta | undefined>('readonly', (s) => s.get('meta'));
export const saveMeta = (meta: SyncMeta) => tx<void>('readwrite', (s) => s.put(meta, 'meta'));
export const clearMeta = () => tx<void>('readwrite', (s) => s.delete('meta'));
export const wipeVault = () => tx<void>('readwrite', (s) => s.clear());

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
