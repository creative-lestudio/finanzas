import { describe, expect, it } from 'vitest';
import { budgetStatus } from './budgets';
import { categorize, learnFromCorrection, matchesPattern } from './categorize';
import { createSession, decryptJSON, encryptJSON, unlock } from './crypto';
import { demoData } from './demo';
import { emptyData } from './defaults';
import { healthReport, netWorth } from './health';
import { mergeMovements, parseBankCSV } from './importer';
import { detectAntExpenses, detectFees, detectSubscriptions } from './insights';
import { merchantKey, parseAmount } from './money';
import { distribute, roundUpAmount, savingProposals } from './savings';
import { balances, settleUp, splitByWeights, splitEqual } from './shared';

describe('importes', () => {
  it('entiende formatos españoles e ingleses', () => {
    expect(parseAmount('1.234,56')).toBe(123456);
    expect(parseAmount('-12,5 €')).toBe(-1250);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('abc')).toBeNull();
  });
  it('normaliza comercios', () => {
    expect(merchantKey('COMPRA MERCADONA 2342 MADRID 12/03')).toBe('mercadona madrid');
    expect(merchantKey('COMPRA SPOTIFY P1234567')).toBe('spotify p1234567');
  });
});

describe('categorización', () => {
  const d = emptyData();
  it('usa palabras clave por palabra completa', () => {
    expect(categorize('COMPRA MERCADONA', -2000, d).categoryId).toBe('groceries');
    expect(categorize('Coffee shop', -300, d).categoryId).not.toBe('fees');
    expect(matchesPattern('uber eats madrid', 'uber eats')).toBe(true);
    expect(categorize('UBER EATS', -1500, d).categoryId).toBe('restaurants');
  });
  it('distingue Bizum enviado y recibido', () => {
    expect(categorize('BIZUM ENVIADO A LAURA', -1000, d).categoryId).toBe('bizum_out');
    expect(categorize('BIZUM RECIBIDO DE PABLO', 1000, d).categoryId).toBe('bizum_in');
  });
  it('aprende de las correcciones', () => {
    const r = mergeMovements(d, 'cash', [
      { date: '2026-01-01', amount: -500, description: 'COMPRA BAR PEPE 1234' },
      { date: '2026-01-02', amount: -700, description: 'COMPRA BAR PEPE 9876' },
    ]);
    const next = learnFromCorrection(r.data, r.added[0], 'restaurants');
    expect(next.transactions.map((t) => t.categoryId)).toEqual(['restaurants', 'restaurants']);
    expect(categorize('COMPRA BAR PEPE 5555', -100, next)).toEqual({ categoryId: 'restaurants', source: 'learned' });
  });
});

describe('importación CSV', () => {
  const csv = `Cuenta;ES12 ****
Saldo;1.000,00

Fecha operación;Fecha valor;Concepto;Importe;Saldo
03/02/2026;03/02/2026;COMPRA NETFLIX.COM;-12,99;987,01
01/02/2026;01/02/2026;"NOMINA; ACME";2.450,00;1.000,00
basura`;
  it('detecta cabecera, separador y formato', () => {
    const r = parseBankCSV(csv);
    expect(r.movements).toEqual([
      { date: '2026-02-03', amount: -1299, description: 'COMPRA NETFLIX.COM' },
      { date: '2026-02-01', amount: 245000, description: 'NOMINA; ACME' },
    ]);
    expect(r.errors).toBe(1);
  });
  it('no duplica al importar dos veces', () => {
    const { movements } = parseBankCSV(csv);
    const a = mergeMovements(emptyData(), 'cash', movements);
    const b = mergeMovements(a.data, 'cash', movements);
    expect(b.added).toHaveLength(0);
    expect(b.duplicates).toBe(2);
    expect(b.data.accounts[0].balance).toBe(245000 - 1299);
  });
  it('soporta columnas cargo/abono', () => {
    const r = parseBankCSV('fecha,concepto,cargo,abono\n2026-01-05,Recibo luz,45.10,\n2026-01-06,Devolución,,10.00');
    expect(r.movements.map((m) => m.amount)).toEqual([-4510, 1000]);
  });
});

describe('detecciones', () => {
  const data = demoData('2026-10-20');
  it('encuentra suscripciones mensuales', () => {
    const subs = detectSubscriptions(data.transactions);
    const names = subs.map((s) => s.key);
    expect(names).toContain('netflix com');
    expect(names.some((n) => n.startsWith('spotify'))).toBe(true);
    expect(subs.find((s) => s.key === 'netflix com')!.frequency).toBe('monthly');
    expect(names.some((n) => n.includes('mercadona'))).toBe(false);
  });
  it('encuentra comisiones', () => {
    expect(detectFees(data.transactions).length).toBeGreaterThanOrEqual(3);
  });
  it('encuentra gastos hormiga', () => {
    const ants = detectAntExpenses(data.transactions, '2026-10-20');
    expect(ants.byMerchant[0].key).toBe('cafeteria el rincon');
    expect(ants.yearly).toBeGreaterThan(ants.total);
  });
});

describe('presupuestos y ahorro', () => {
  const data = demoData('2026-10-20');
  it('calcula el estado del presupuesto', () => {
    const s = budgetStatus(data, '2026-10', 20);
    const coffee = s.find((b) => b.budget.categoryId === 'coffee')!;
    expect(coffee.spent).toBeGreaterThan(0);
    expect(['warning', 'over', 'ok']).toContain(coffee.state);
  });
  it('redondea compras', () => {
    expect(roundUpAmount(-1230)).toBe(70);
    expect(roundUpAmount(-1200)).toBe(0);
    expect(roundUpAmount(500)).toBe(0);
  });
  it('reparte por prioridad sin pasarse', () => {
    const goals = [
      { id: 'a', name: 'a', icon: '', target: 1000, saved: 900, priority: 1 },
      { id: 'b', name: 'b', icon: '', target: 1000, saved: 0, priority: 2 },
    ];
    expect(distribute(goals, 500)).toEqual([{ goalId: 'a', amount: 100 }, { goalId: 'b', amount: 400 }]);
  });
  it('propone ahorro automático', () => {
    const p = savingProposals(data, '2026-10');
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x.amount > 0)).toBe(true);
  });
});

describe('gastos compartidos', () => {
  it('reparte sin perder céntimos', () => {
    expect(splitEqual(1000, ['a', 'b', 'c'])).toEqual({ a: 334, b: 333, c: 333 });
    const w = splitByWeights(1001, { a: 60, b: 40 });
    expect(w.a + w.b).toBe(1001);
  });
  it('salda deudas', () => {
    const bal = balances(demoData('2026-10-20').sharedExpenses, ['Yo', 'Laura', 'Pablo']);
    expect(Object.values(bal).reduce((s, v) => s + v, 0)).toBe(0);
    const transfers = settleUp(bal);
    const after = { ...bal };
    for (const t of transfers) {
      after[t.from] += t.amount;
      after[t.to] -= t.amount;
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });
});

describe('salud y patrimonio', () => {
  const data = demoData('2026-10-20');
  it('consolida patrimonio con deudas', () => {
    const nw = netWorth(data);
    expect(nw.liabilities).toBe(640000);
    expect(nw.net).toBe(nw.assets - nw.liabilities);
  });
  it('da una puntuación entre 0 y 100 con consejos', () => {
    const r = healthReport(data, '2026-10', 20);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.factors).toHaveLength(6);
    expect(r.tips.length).toBeGreaterThan(0);
  });
});

describe('cifrado', () => {
  it('cifra y descifra, y rechaza la contraseña incorrecta', async () => {
    const s = await createSession('1234', 1000);
    const blob = await encryptJSON(s, { hola: 'mundo' });
    expect(blob.data).not.toContain('mundo');
    expect(await decryptJSON(s, blob)).toEqual({ hola: 'mundo' });
    expect((await unlock('1234', blob)).value).toEqual({ hola: 'mundo' });
    await expect(unlock('0000', blob)).rejects.toThrow();
  });
});
