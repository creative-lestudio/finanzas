import { isNative } from './native';

// Desbloqueo con Face ID / Touch ID / huella / Windows Hello.
//  · En la web se usa WebAuthn con el autenticador de la plataforma (pide verificación de usuario).
//  · En la app instalada (Capacitor) se usa el plugin biométrico del sistema.
// Es una verificación local de que quien abre es el dueño del dispositivo: la clave de cifrado no sale de él.

const FLAG = 'finanzas.bio';

interface Flag {
  mode: 'webauthn' | 'native';
  id?: string;
}

const read = (): Flag | null => {
  try {
    const raw = localStorage.getItem(FLAG);
    return raw ? (JSON.parse(raw) as Flag) : null;
  } catch {
    return null;
  }
};

export const bioEnabled = (): boolean => read() !== null;

export function bioLabel(): string {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'Face ID / Touch ID';
  if (/android/i.test(ua)) return 'huella o rostro';
  if (/mac/i.test(ua)) return 'Touch ID';
  if (/windows/i.test(ua)) return 'Windows Hello';
  return 'biometría';
}

const b64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function bioAvailable(): Promise<boolean> {
  try {
    if (isNative()) {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      return (await BiometricAuth.checkBiometry()).isAvailable;
    }
    if (!window.isSecureContext || !window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Registra la biometría de este dispositivo. Devuelve false si el usuario cancela o no es posible. */
export async function bioEnroll(name: string): Promise<boolean> {
  try {
    if (isNative()) {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      await BiometricAuth.authenticate({ reason: 'Activar el desbloqueo biométrico de Finanzas', cancelTitle: 'Cancelar', allowDeviceCredential: true });
      localStorage.setItem(FLAG, JSON.stringify({ mode: 'native' } satisfies Flag));
      return true;
    }
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Finanzas', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name, displayName: name },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(FLAG, JSON.stringify({ mode: 'webauthn', id: b64(cred.rawId) } satisfies Flag));
    return true;
  } catch {
    return false;
  }
}

/** Pide Face ID / huella. true = el dueño se identificó. */
export async function bioVerify(reason = 'Desbloquear Finanzas'): Promise<boolean> {
  const f = read();
  if (!f) return false;
  try {
    if (f.mode === 'native') {
      const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
      await BiometricAuth.authenticate({ reason, cancelTitle: 'Usar contraseña', allowDeviceCredential: true });
      return true;
    }
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: f.id ? [{ type: 'public-key', id: unb64(f.id), transports: ['internal'] }] : [],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return Boolean(got);
  } catch {
    return false;
  }
}

export function bioDisable(): void {
  try {
    localStorage.removeItem(FLAG);
  } catch {
    /* ignorado */
  }
}
