import type { EncryptedBlob } from './crypto';

// Almacén local en IndexedDB. Solo guarda el blob cifrado: nada sale del
// dispositivo salvo que el usuario exporte una copia o active la sincronización.

const DB = 'finanzas';
const STORE = 'vault';
const KEY = 'data';

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

export const loadVault = () => tx<EncryptedBlob | undefined>('readonly', (s) => s.get(KEY));
export const saveVault = (blob: EncryptedBlob) => tx<void>('readwrite', (s) => s.put(blob, KEY));
export const wipeVault = () => tx<void>('readwrite', (s) => s.delete(KEY));
