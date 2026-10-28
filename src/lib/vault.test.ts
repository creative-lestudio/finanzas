import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createSession, encryptJSON, unlock } from './crypto';
import { emptyData } from './defaults';
import { listBackupStamps, loadVault, wipeVault } from './storage';
import { backupIfDue, VaultWriter, type SaveState } from './vault';
import type { AppData } from './types';

const withTx = (n: number): AppData => ({
  ...emptyData(),
  transactions: Array.from({ length: n }, (_, i) => ({ id: `t${i}`, date: '2026-10-01', amount: -100 * (i + 1), accountId: 'a', description: `mov ${i}`, categoryId: 'x' }) as never),
});

describe('VaultWriter', () => {
  it('guarda y se puede reabrir con la contraseña (76 movimientos)', async () => {
    await wipeVault();
    const session = await createSession('clave-segura', 1000);
    const states: SaveState[] = [];
    const w = new VaultWriter(() => session, (s) => states.push(s));
    w.set(withTx(76));
    await w.flush();
    const blob = await loadVault();
    const r = await unlock<AppData>('clave-segura', blob!);
    expect(r.value.transactions).toHaveLength(76);
    expect(states.at(-1)?.status).toBe('saved');
  });

  it('cambios seguidos: siempre gana el último y nunca uno viejo', async () => {
    await wipeVault();
    const session = await createSession('x', 1000);
    const w = new VaultWriter(() => session, () => {});
    w.set(withTx(1));
    w.set(withTx(5));
    const p = w.flush();
    w.set(withTx(76));
    await p;
    await w.flush();
    const r = await unlock<AppData>('x', (await loadVault())!);
    expect(r.value.transactions).toHaveLength(76);
  });

  it('si el guardado falla avisa y reintenta sin perder los datos', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await wipeVault();
    const session = await createSession('x', 1000);
    const states: SaveState[] = [];
    let broken = true;
    const w = new VaultWriter(() => (broken ? ({ key: null } as never) : session), (s) => states.push(s));
    w.set(withTx(76));
    await w.flush();
    expect(states.at(-1)?.status).toBe('error');
    broken = false;
    await vi.advanceTimersByTimeAsync(3100);
    await w.flush();
    expect(states.at(-1)?.status).toBe('saved');
    const r = await unlock<AppData>('x', (await loadVault())!);
    expect(r.value.transactions).toHaveLength(76);
    vi.useRealTimers();
  });
});

describe('copias automáticas', () => {
  it('crea una copia, respeta el intervalo y conserva un máximo', async () => {
    await wipeVault();
    const session = await createSession('x', 1000);
    const blob = await encryptJSON(session, withTx(3));
    await backupIfDue(blob);
    await backupIfDue(blob); // dentro de la media hora: no duplica
    expect(await listBackupStamps()).toHaveLength(1);
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2));
      await backupIfDue(blob, true);
    }
    expect((await listBackupStamps()).length).toBe(8);
  });
});
