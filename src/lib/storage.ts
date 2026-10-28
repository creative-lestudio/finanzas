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
