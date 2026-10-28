import { encryptJSON, type EncryptedBlob, type Session } from './crypto';
import { listBackupStamps, loadVault, pruneBackups, saveBackup, saveVault } from './storage';
import type { AppData } from './types';

export type SaveStatus = 'saved' | 'saving' | 'error';
export interface SaveState {
  status: SaveStatus;
  error?: string;
}

const DEBOUNCE_MS = 20;
const RETRY_MS = 3000;

/**
 * Escritura de los datos locales. Una sola cola: siempre se guarda lo ÚLTIMO que
 * se pidió, nunca una versión vieja pisando otra nueva; cada escritura se
 * verifica leyéndola de vuelta; si falla se avisa y se reintenta.
 */
export class VaultWriter {
  private latest: AppData | null = null;
  private dirty = false;
  private chain: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private session: () => Session | null,
    private notify: (s: SaveState) => void,
  ) {}

  /** Programa guardar estos datos (agrupa cambios seguidos). */
  set(data: AppData): void {
    this.latest = data;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DEBOUNCE_MS);
    this.notify({ status: 'saving' });
  }

  /** Espera a que todo lo pendiente esté escrito y verificado en disco. */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.chain = this.chain.then(() => this.drain());
    return this.chain;
  }

  /** Olvida lo pendiente (tras bloquear o borrar). */
  reset(): void {
    clearTimeout(this.timer);
    clearTimeout(this.retry);
    this.latest = null;
    this.dirty = false;
  }

  private async drain(): Promise<void> {
    while (this.dirty) {
      const s = this.session();
      const d = this.latest;
      if (!s || !d) {
        this.dirty = false;
        return;
      }
      this.dirty = false;
      try {
        const blob = await encryptJSON(s, d);
        await saveVault(blob);
        const back = await loadVault();
        if (!back || back.iv !== blob.iv) throw new Error('El dispositivo no confirmó el guardado.');
        if (!this.dirty) this.notify({ status: 'saved' });
      } catch (e) {
        // Se conserva lo pendiente y se reintenta; mientras tanto la app avisa.
        if (!this.latest || this.latest === d) this.dirty = true;
        this.notify({ status: 'error', error: (e as Error).message || 'No se pudo guardar en este dispositivo.' });
        clearTimeout(this.retry);
        this.retry = setTimeout(() => void this.flush(), RETRY_MS);
        return;
      }
    }
  }
}

const BACKUP_EVERY_MS = 30 * 60_000;
const BACKUPS_KEPT = 8;

/** Guarda una copia cifrada si la última tiene más de media hora (o si se fuerza). */
export async function backupIfDue(blob: EncryptedBlob | undefined, force = false): Promise<void> {
  if (!blob) return;
  const last = (await listBackupStamps())[0];
  if (!force && last && Date.now() - Date.parse(last) < BACKUP_EVERY_MS) return;
  await saveBackup(blob);
  await pruneBackups(BACKUPS_KEPT);
}

/** Cuenta de movimientos: para mostrar qué contiene cada copia. */
export const countTx = (d: AppData) => d.transactions.length;

/** Pide al navegador que no borre los datos locales cuando falte espacio. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* no disponible */
  }
}
