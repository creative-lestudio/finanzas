// Cifrado de los datos en reposo con Web Crypto: AES-GCM 256 bits y clave
// derivada del PIN/contraseña con PBKDF2-SHA256 (600.000 iteraciones, según
// la recomendación de OWASP). La clave nunca se guarda: solo vive en memoria
// mientras la app está desbloqueada.

export interface EncryptedBlob {
  v: 1;
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

export const PBKDF2_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const fromB64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface Session {
  key: CryptoKey;
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
}

export async function createSession(passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<Session> {
  const salt = randomBytes(16);
  return { key: await deriveKey(passphrase, salt, iterations), salt, iterations };
}

export async function encryptJSON(session: Session, value: unknown): Promise<EncryptedBlob> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.key, enc.encode(JSON.stringify(value)));
  return {
    v: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: session.iterations,
    salt: toB64(session.salt),
    iv: toB64(iv),
    data: toB64(ct),
  };
}

/** Descifra con la contraseña. Lanza un error si es incorrecta (falla la etiqueta GCM). */
export async function unlock<T>(passphrase: string, blob: EncryptedBlob): Promise<{ session: Session; value: T }> {
  const salt = fromB64(blob.salt);
  const key = await deriveKey(passphrase, salt, blob.iterations);
  const session = { key, salt, iterations: blob.iterations };
  return { session, value: await decryptJSON<T>(session, blob) };
}

export async function decryptJSON<T>(session: Session, blob: EncryptedBlob): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, session.key, fromB64(blob.data));
  return JSON.parse(dec.decode(pt)) as T;
}

export async function sha256(text: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return toB64(h).slice(0, 22);
}
