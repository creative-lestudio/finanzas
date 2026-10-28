import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decryptJSON, encryptJSON, type EncryptedBlob, type Session } from './crypto';
import { emptyData, migrate } from './defaults';
import { merge3 } from './merge';
import type { AppData } from './types';

// Sincronización entre dispositivos con Supabase, cifrada de extremo a
// extremo: al servidor solo llega el blob cifrado con tu contraseña. Ni
// Supabase ni nadie con acceso a la base de datos puede leer tus finanzas.
//
// Tabla `vaults` (una fila por usuario) con control de versión optimista:
// si otro dispositivo escribió antes, se descarga, se fusiona y se reintenta.

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const CONFIG_KEY = 'finanzas.supabase';

export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) return JSON.parse(saved) as SupabaseConfig;
  } catch {
    /* almacenamiento no disponible */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export function setSupabaseConfig(cfg: SupabaseConfig | null) {
  try {
    if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignorado */
  }
  client = null;
}

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (client) return client;
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, storageKey: 'finanzas.auth' } });
  return client;
}

export class PassphraseMismatch extends Error {
  constructor(readonly blob: EncryptedBlob) {
    super('Los datos de la nube están cifrados con otra contraseña.');
  }
}

interface RemoteRow {
  blob: EncryptedBlob;
  version: number;
}

export async function fetchRemote(sb: SupabaseClient): Promise<RemoteRow | null> {
  const { data, error } = await sb.from('vaults').select('blob, version').maybeSingle();
  if (error) throw new Error(error.message);
  return data as RemoteRow | null;
}

export interface SyncState {
  /** Versión remota con la que se fusionó por última vez. */
  version: number;
  base: AppData | null;
}

export interface SyncResult {
  data: AppData;
  version: number;
  /** Hubo cambios de otro dispositivo. */
  pulled: boolean;
  pushed: boolean;
}

/**
 * Un ciclo completo de sincronización. Devuelve los datos fusionados que la
 * app debe mostrar y la nueva base.
 */
export async function syncOnce(sb: SupabaseClient, session: Session, local: AppData, state: SyncState): Promise<SyncResult> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error('No has iniciado sesión.');

  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await fetchRemote(sb);
    if (!remote) {
      const { error } = await sb.from('vaults').insert({ user_id: auth.user.id, blob: await encryptJSON(session, local), version: 1 });
      if (error) {
        if (error.code === '23505') continue; // otro dispositivo la creó a la vez
        throw new Error(error.message);
      }
      return { data: local, version: 1, pulled: false, pushed: true };
    }

    let merged = local;
    let pulled = false;
    if (remote.version !== state.version) {
      let remoteData: AppData;
      try {
        remoteData = migrate(await decryptJSON<AppData>(session, remote.blob));
      } catch {
        throw new PassphraseMismatch(remote.blob);
      }
      // Primera vez en este dispositivo: base vacía → se unen los datos de ambos lados.
      merged = merge3(state.base ?? { ...emptyData(), categories: [], accounts: [] }, local, remoteData);
      pulled = JSON.stringify(merged) !== JSON.stringify(local);
      // Sin cambios locales desde la base: basta con adoptar la versión remota.
      if (state.base && JSON.stringify(local) === JSON.stringify(state.base)) {
        return { data: remoteData, version: remote.version, pulled: true, pushed: false };
      }
    } else if (state.base && JSON.stringify(local) === JSON.stringify(state.base)) {
      return { data: local, version: remote.version, pulled: false, pushed: false };
    }

    const { data: updated, error } = await sb
      .from('vaults')
      .update({ blob: await encryptJSON(session, merged), version: remote.version + 1, updated_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('version', remote.version)
      .select('version');
    if (error) throw new Error(error.message);
    if (updated && updated.length) return { data: merged, version: remote.version + 1, pulled, pushed: true };
    // Otro dispositivo escribió entre medias: repetir con la versión nueva.
  }
  throw new Error('Demasiados cambios simultáneos; se reintentará.');
}

/** Avisa cuando otro dispositivo sube cambios (Supabase Realtime). */
export function watchRemote(sb: SupabaseClient, userId: string, onChange: () => void): () => void {
  const channel = sb
    .channel(`vault-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vaults', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}
