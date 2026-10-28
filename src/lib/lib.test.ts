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
import { addRate, analyzeExchange, analyzeIncomeFx, deleteExchange, fxSummary, rateFor, recordExchange, simulateChain } from './fx';
import { futureValue, goalProgress } from './goals';
import { merge3 } from './merge';
import { parseVoiceLocal } from './voice';
import { applyExcelImport, exportWorkbook, readWorkbook } from './excel';
import { monthSummary } from './insights';
import type { AppData, Goal, Transaction } from './types';

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
    const subs = detectSubscriptions(data);
    const names = subs.map((s) => s.key);
    expect(names).toContain('netflix com');
    expect(names.some((n) => n.startsWith('spotify'))).toBe(true);
    expect(subs.find((s) => s.key === 'netflix com')!.frequency).toBe('monthly');
    expect(names.some((n) => n.includes('mercadona'))).toBe(false);
  });
  it('encuentra comisiones', () => {
    expect(detectFees(data).length).toBeGreaterThanOrEqual(3);
  });
  it('encuentra gastos hormiga', () => {
    const ants = detectAntExpenses(data, '2026-10-20');
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

describe('divisas', () => {
  const base = (): AppData => {
    let d = emptyData();
    d.settings = { ...d.settings, currency: 'USD', rateSource: { VES: 'Paralelo' } };
    d.accounts = [
      { id: 'ves', name: 'Banesco', kind: 'checking', balance: 0, currency: 'VES', source: 'manual' },
      { id: 'usd', name: 'Wise USD', kind: 'checking', balance: 0, currency: 'USD', source: 'manual' },
      { id: 'eur', name: 'Wise EUR', kind: 'checking', balance: 0, currency: 'EUR', source: 'manual' },
    ];
    d = addRate(d, { date: '2026-10-01', base: 'USD', quote: 'VES', rate: 40, source: 'BCV' });
    d = addRate(d, { date: '2026-10-01', base: 'USD', quote: 'VES', rate: 50, source: 'Paralelo' });
    d = addRate(d, { date: '2026-10-01', base: 'EUR', quote: 'USD', rate: 1.1, source: 'Mercado medio' });
    return d;
  };

  it('usa la fuente preferida, invierte pares y cruza vía USD', () => {
    const d = base();
    expect(rateFor(d, 'USD', 'VES', '2026-10-05')).toBe(50);
    expect(rateFor(d, 'USD', 'VES', '2026-10-05', 'BCV')).toBe(40);
    expect(rateFor(d, 'VES', 'USD', '2026-10-05')).toBeCloseTo(0.02);
    expect(rateFor(d, 'EUR', 'VES', '2026-10-05')).toBeCloseTo(55);
    expect(rateFor(d, 'USDT', 'USD', '2026-10-05')).toBe(1);
  });

  it('calcula lo que se pierde al cobrar 800 $ a tasa BCV', () => {
    const d = base();
    const t: Transaction = { id: 't', accountId: 'ves', date: '2026-10-05', amount: 3200000, description: 'Cobro', categoryId: 'salary', categorySource: 'user', fx: { amount: 80000, currency: 'USD', rate: 40, source: 'BCV' } };
    const a = analyzeIncomeFx({ ...d, transactions: [t] }, t)!;
    expect(a.realValue).toBe(64000); // 32.000 Bs / 50 = 640 $
    expect(a.diff).toBe(-16000); // pierdes 160 $
    expect(a.diffPct).toBeCloseTo(-0.2);
  });

  it('mide la pérdida de un cambio frente a la tasa de referencia', () => {
    const d = base();
    const next = recordExchange(d, { date: '2026-10-06', fromAccountId: 'usd', fromAmount: 64000, toAccountId: 'eur', toAmount: 57500, fee: 400, platform: 'Wise' });
    expect(next.accounts.find((a) => a.id === 'usd')!.balance).toBe(-64000);
    expect(next.accounts.find((a) => a.id === 'eur')!.balance).toBe(57500);
    const a = analyzeExchange(next, next.exchanges[0]);
    expect(a.expected).toBe(Math.round(64000 / 1.1)); // 581,82 €
    expect(a.diff).toBe(57500 - Math.round(64000 / 1.1));
    expect(a.diffBase).toBeLessThan(0);
    const back = deleteExchange(next, next.exchanges[0].id);
    expect(back.transactions).toHaveLength(0);
    expect(back.accounts.find((x) => x.id === 'eur')!.balance).toBe(0);
  });

  it('simula la ruta del dinero paso a paso', () => {
    const r = simulateChain(
      { amount: 80000, currency: 'USD' },
      [
        { label: 'Cobro a tasa BCV', to: 'VES', rate: 40 },
        { label: 'Compra de $ en paralelo', to: 'USD', rate: 1 / 50 },
        { label: 'Wise a euros', to: 'EUR', rate: 1 / 1.12, feeFixed: 450 },
      ],
      { VES: 50, EUR: 1 / 1.1 },
    );
    expect(r[1].amount).toBe(3200000);
    expect(r[1].stepDiff).toBe(-16000);
    expect(r[2].amount).toBe(64000);
    expect(r[2].stepDiff).toBe(0);
    expect(r[3].totalDiff).toBeLessThan(-16000);
  });

  it('suma informes en la moneda principal', () => {
    const d = demoData('2026-10-20');
    const s = monthSummary(d, '2026-09');
    expect(s.missingRates.size).toBe(0);
    expect(fxSummary(d).total).toBeLessThan(0);
  });
});

describe('metas medibles', () => {
  it('calcula aportación necesaria, proyección y estado', () => {
    const d = emptyData();
    const g: Goal = { id: 'g', name: 'Colchón', icon: '', target: 600000, saved: 100000, priority: 1, deadline: '2027-09-15', monthlyPlan: 50000 };
    d.goals = [g];
    const p = goalProgress(d, g, '2026-10-20');
    expect(p.monthsLeft).toBe(12);
    expect(p.requiredMonthly).toBe(Math.ceil(500000 / 12));
    expect(p.status).toBe('ahead');
  });
  it('proyecta inversión con interés compuesto y mide por saldo de cuentas', () => {
    expect(futureValue(100000, 0, 12, 12)).toBe(Math.round(100000 * 1.01 ** 12));
    const d = demoData('2026-10-20');
    const g = d.goals.find((x) => x.id === 'g4')!;
    const p = goalProgress(d, g, '2026-10-20');
    expect(p.current).toBe(830000);
    expect(p.requiredMonthly).toBeGreaterThan(0);
  });
});

describe('sincronización: fusión a tres bandas', () => {
  it('une movimientos nuevos de ambos lados, respeta borrados y suma saldos', () => {
    const b = demoData('2026-10-20');
    const local = mergeMovements(b, 'cash', [{ date: '2026-10-20', amount: -500, description: 'Café móvil' }]).data;
    let remote = mergeMovements(b, 'cash', [{ date: '2026-10-20', amount: -1200, description: 'Taxi portátil' }]).data;
    const removed = b.transactions[0];
    remote = { ...remote, transactions: remote.transactions.filter((t) => t.id !== removed.id) };
    const m = merge3(b, local, remote);
    expect(m.transactions.some((t) => t.description === 'Café móvil')).toBe(true);
    expect(m.transactions.some((t) => t.description === 'Taxi portátil')).toBe(true);
    expect(m.transactions.some((t) => t.id === removed.id)).toBe(false);
    const cashBase = b.accounts.find((a) => a.id === 'cash')!.balance;
    expect(m.accounts.find((a) => a.id === 'cash')!.balance).toBe(cashBase - 1700);
  });
});

describe('voz', () => {
  const d = demoData('2026-10-20');
  it('entiende "gasté 50 euros en mercadona"', () => {
    const v = parseVoiceLocal('Gasté 50 euros en Mercadona', d);
    expect(v).toMatchObject({ kind: 'expense', amount: 5000, currency: 'EUR', categoryId: 'groceries', description: 'Mercadona' });
    expect(v.accountId).toBe('main');
  });
  it('entiende números en palabras, efectivo y ayer', () => {
    const v = parseVoiceLocal('ayer pagué cincuenta y cinco euros en efectivo en la farmacia', d);
    expect(v.amount).toBe(5500);
    expect(v.accountId).toBe('cash');
    expect(v.categoryId).toBe('health');
    expect(v.date).not.toBe(new Date().toISOString().slice(0, 10));
  });
  it('detecta ingresos y pide lo que falta', () => {
    const v = parseVoiceLocal('me pagaron 1.500 dólares', d);
    expect(v.kind).toBe('income');
    expect(v.amount).toBe(150000);
    expect(v.currency).toBe('USD');
    expect(v.missing).toContain('category');
  });
});

describe('excel', () => {
  it('exporta y vuelve a importar los movimientos', async () => {
    const d = demoData('2026-10-20');
    const blob = await exportWorkbook(d);
    const imp = await readWorkbook(await blob.arrayBuffer());
    expect(imp.movements.length).toBe(d.transactions.length);
    const again = applyExcelImport(d, imp, 'main');
    expect(again.added).toBe(0);
    const fresh = applyExcelImport(emptyData(), imp, 'cash');
    expect(fresh.added).toBe(d.transactions.length);
    expect(fresh.data.accounts.some((a) => a.name === 'Banesco (Bs)' && a.currency === 'VES')).toBe(true);
  });
});
