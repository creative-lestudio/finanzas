import { describe, expect, it } from 'vitest';
import { categorize, learnFromCorrection, matchesPattern } from './categorize';
import { createSession, decryptJSON, encryptJSON, unlock } from './crypto';
import { demoData } from './demo';
import { emptyData, migrate } from './defaults';
import { canMoveUnder, groupByRoot, registerCategories, rootOf } from './categories';
import { applySuggestedStructure } from './categoryTree';
import { buildReport, monthsFor, ranking } from './reports';
import { budgetStatus } from './budgets';
import { healthReport, netWorth } from './health';
import { mergeMovements, parseBankCSV } from './importer';
import { detectAntExpenses, detectFees, detectSubscriptions } from './insights';
import { formatMoney, merchantKey, parseAmount, setMasked } from './money';
import { spendByFamily } from './families';
import { distribute, roundUpAmount, savingProposals } from './savings';
import { balances, settleUp, splitByWeights, splitEqual } from './shared';
import { accountBase, addRate, convert, displayPair, referenceTypesFor, analyzeExchange, analyzeIncomeFx, deleteExchange, fxSummary, rateFor, recordExchange, simulateChain } from './fx';
import { futureValue, goalProgress } from './goals';
import { merge3 } from './merge';
import { toSharedExpenses, type CloudEntry } from './cloudShared';
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
    expect(parseAmount('1.500')).toBe(150000);
    expect(parseAmount('12.5')).toBe(1250);
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
    d = addRate(d, { date: '2026-10-01', base: 'EUR', quote: 'USD', rate: 1.1, source: 'Personalizada' });
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

describe('tipos de tasa', () => {
  it('ordena el par como se lee y propone referencias según las monedas', () => {
    expect(displayPair('VES', 'USD')).toEqual(['USD', 'VES']);
    expect(displayPair('USD', 'EUR')).toEqual(['EUR', 'USD']);
    expect(referenceTypesFor('VES', 'USDT')).toEqual(['Paralelo', 'BCV', 'Personalizada']);
    expect(referenceTypesFor('EUR', 'VES')).toEqual(['Euro', 'Personalizada']);
    expect(referenceTypesFor('USD', 'EUR')).toEqual(['Personalizada']);
  });
  it('migra fuentes antiguas a Personalizada', () => {
    const d = emptyData();
    d.rates = [{ id: 'r', date: '2026-01-01', base: 'EUR', quote: 'USD', rate: 1.1, source: 'Mercado medio' }];
    d.settings.rateSource = { VES: 'Binance P2P', EUR: 'Euro' };
    const m = migrate(d);
    expect(m.rates[0].source).toBe('Personalizada');
    expect(m.settings.rateSource).toEqual({ EUR: 'Euro' });
  });
});

describe('ojito', () => {
  it('oculta las cifras y mantiene la moneda', () => {
    setMasked(true);
    expect(formatMoney(123456, 'EUR')).not.toMatch(/\d/);
    expect(formatMoney(123456, 'EUR')).toContain('€');
    expect(formatMoney(-500, 'USDT')).toContain('USDT');
    setMasked(false);
    expect(formatMoney(123456, 'EUR')).toMatch(/1\.?234,56/);
  });
  it('agrupa el gasto por familias en orden fijo', () => {
    const r = spendByFamily({ shopping: 100, groceries: 50, salary: 999, fees: 20 });
    expect(r.map((x) => x.family.id)).toEqual(['comida', 'compras', 'otros']);
  });
});

describe('hoja propia (Tipo, Cuenta, Moneda, Monto)', () => {
  const csv = `Fecha,Tipo,Cuenta,Moneda,Categoría,Descripción,Monto,Cuenta destino,Monto destino,Vía
"2026-09-01","Gasto","Efectivo","EUR","Alimentación/Mercado","Mercadona","72.19","","",""
"2026-09-03","Ingreso","Banco VE","BS","Ingreso Trabajo","Cliente","1250","","",""
"2026-09-06","Cambio","Banco VE","BS","","Cambio","1090","Chase","1090","Binance P2P"
"2026-09-07","Ingreso","Chase","USD","Legacy","Aporte","400","","",""
"2026-09-08","Gasto","Chase","USD","Legacy","Alquiler","240","","",""`;
  it('reconoce el formato, crea cuentas y categorías y registra los cambios', async () => {
    const { csvRows, parseLedger, applyLedger } = await import('./importer');
    const l = parseLedger(csvRows(csv))!;
    expect(l.rows).toHaveLength(5);
    const d0 = emptyData();
    d0.accounts = [];
    const r = applyLedger(d0, l.rows, { currencyMap: { BS: 'USD' } });
    expect(r.exchanges).toBe(1);
    expect(r.transactions).toBe(4);
    const bal = (n: string) => r.data.accounts.find((a) => a.name === n)!;
    expect(bal('Efectivo').balance).toBe(-7219);
    expect(bal('Banco VE')).toMatchObject({ currency: 'USD', balance: 125000 - 109000 });
    expect(bal('Chase')).toMatchObject({ currency: 'USD', balance: 109000 + 40000 - 24000 });
    expect(r.data.transactions.find((t) => t.description === 'Mercadona')!.categoryId).toBe('groceries');
    expect(r.data.transactions.find((t) => t.description === 'Aporte')!.categoryId).not.toBe(r.data.transactions.find((t) => t.description === 'Alquiler')!.categoryId);
    expect(applyLedger(r.data, l.rows, { currencyMap: { BS: 'USD' } })).toMatchObject({ transactions: 0, exchanges: 0, duplicates: 5 });
    expect(parseLedger(csvRows('Fecha,Concepto,Importe\n2026-01-01,x,5'))).toBeNull();
  });
});

describe('valoración de bolívares', () => {
  it('con Paralelo elegido lo usa si está al día (hasta 3 días de diferencia con la BCV)', () => {
    let d = emptyData();
    d.settings = { ...d.settings, currency: 'EUR', rateSource: { VES: 'Paralelo' } };
    d = addRate(d, { date: '2026-10-03', base: 'USD', quote: 'VES', rate: 1100, source: 'Paralelo' });
    d = addRate(d, { date: '2026-10-05', base: 'USD', quote: 'VES', rate: 880, source: 'BCV' });
    expect(rateFor(d, 'USD', 'VES', '2026-10-06')).toBe(1100);
    expect(rateFor(d, 'USD', 'VES', '2026-10-06', 'BCV')).toBe(880);
    const solo = addRate(emptyData(), { date: '2026-10-05', base: 'USD', quote: 'VES', rate: 880, source: 'BCV' });
    expect(rateFor(solo, 'USD', 'VES', '2026-10-06')).toBe(880);
    d.settings = { ...d.settings, rateSource: {} };
    expect(rateFor(d, 'USD', 'VES', '2026-10-06')).toBe(880); // oficial por defecto
  });
});

describe('equivalente en moneda principal', () => {
  it('un cobro en Bs con tasa acordada cuenta por su equivalente, no por la tasa del día', () => {
    const d = emptyData();
    d.settings.currency = 'USD';
    d.accounts = [{ id: 'ves', name: 'Banesco', kind: 'checking', balance: 0, currency: 'VES', source: 'manual' }];
    d.rates = [{ id: 'r', date: '2026-09-01', base: 'USD', quote: 'VES', rate: 60, source: 'Paralelo' }];
    const t = { id: 't1', accountId: 'ves', date: '2026-09-10', amount: 5650000, description: 'MDS', categoryId: 'income', categorySource: 'user' as const, fx: { amount: 125000, currency: 'USD', rate: 45.2, source: 'Personalizada' } };
    const sinFx = { ...t, id: 't2', fx: undefined };
    d.categories = [{ id: 'income', name: 'Nómina', icon: '', kind: 'income' } as never];
    d.transactions = [t, sinFx];
    const sum = monthSummary(d, '2026-09');
    // 1.250 $ acordados + 56.500 Bs a 60 (paralelo) = 941,67 $
    expect(sum.income).toBe(125000 + Math.round(5650000 / 60));
  });
});

describe('cobro en bolívares a tasa acordada (caso real)', () => {
  const montar = () => {
    const d = emptyData();
    d.settings.currency = 'USD';
    d.accounts = [{ id: 'ves', name: 'Banesco', kind: 'checking', balance: 114183038, currency: 'VES', source: 'manual' }];
    d.rates = [{ id: 'r', date: '2026-10-20', base: 'USD', quote: 'VES', rate: 1100, source: 'Paralelo' }];
    d.categories = [{ id: 'income', name: 'Nómina', icon: '', kind: 'income' } as never];
    const bs = parseAmount('1.141.830,38')!;
    const usd = Math.round(bs / 940);
    d.transactions = [{ id: 't1', accountId: 'ves', date: '2026-09-15', amount: bs, description: 'MDS', categoryId: 'income', categorySource: 'user', fx: { amount: usd, currency: 'USD', rate: 940, source: 'Personalizada' } }];
    return { d, bs, usd };
  };
  it('el monto en bolívares se interpreta bien y su equivalente es 1.214,71 $', () => {
    const { bs, usd } = montar();
    expect(bs).toBe(114183038);
    expect(usd).toBe(121471);
  });
  it('el ingreso del mes suma el equivalente en dólares, no los bolívares', () => {
    const { d, usd } = montar();
    expect(monthSummary(d, '2026-09').income).toBe(usd);
  });
  it('la cuenta en Bs vale su saldo a la tasa de hoy (coherente con lo que se ve junto al saldo)', () => {
    const { d } = montar();
    const hoy = Math.round(114183038 / 1100);
    expect(accountBase(d, d.accounts[0], '2026-11-03')).toBe(hoy);
    expect(netWorth(d).net).toBe(hoy);
  });
  it('aunque haya movimientos con equivalente y tasas antiguas, 163.823,83 Bs ≈ 183,84 $ a BCV 891,11', () => {
    const d = emptyData();
    d.settings.currency = 'USD';
    d.accounts = [{ id: 'ves', name: 'BBVA VE', kind: 'checking', balance: 16382383, currency: 'VES', source: 'manual' }];
    d.rates = [
      { id: 'a', date: '2025-01-05', base: 'USD', quote: 'VES', rate: 28, source: 'Paralelo' },
      { id: 'b', date: '2026-11-03', base: 'USD', quote: 'VES', rate: 891.11, source: 'BCV' },
    ];
    d.transactions = [{ id: 't', accountId: 'ves', date: '2026-09-15', amount: 114183038, description: 'x', categoryId: 'income', categorySource: 'user', fx: { amount: 121471, currency: 'USD', rate: 940, source: 'Personalizada' } }];
    expect(accountBase(d, d.accounts[0], '2026-11-03')).toBe(18384);
  });
});

describe('categorías madre y subcategorías', () => {
  const montar = () => {
    const d = emptyData();
    d.settings.currency = 'EUR';
    d.accounts = [{ id: 'a', name: 'Cuenta', kind: 'checking', balance: 0, currency: 'EUR', source: 'manual' }];
    d.categories = [
      ...d.categories,
      { id: 'compras', name: 'Compras', icon: 'ic:bag', kind: 'expense', family: 'compras' },
      { id: 'higiene', name: 'Higiene', icon: '', kind: 'expense', parentId: 'compras' },
      { id: 'ropa', name: 'Ropa', icon: '', kind: 'expense', parentId: 'compras' },
    ];
    const tx = (id: string, cat: string, cents: number, date = '2026-10-10') => ({ id, accountId: 'a', date, amount: cents, description: id, categoryId: cat, categorySource: 'user' as const });
    d.transactions = [tx('t1', 'higiene', -2000), tx('t2', 'ropa', -5000), tx('t3', 'compras', -1000), tx('t4', 'salary', 300000)];
    registerCategories(d.categories);
    return d;
  };
  it('las subcategorías se agrupan en su madre', () => {
    montar();
    expect(rootOf('ropa')).toBe('compras');
    expect(groupByRoot({ ropa: 50, higiene: 20, compras: 10, salary: 5 })).toEqual({ compras: 80, salary: 5 });
  });
  it('no permite ciclos ni más de un nivel', () => {
    const d = montar();
    expect(canMoveUnder(d.categories, 'ropa', 'compras')).toBe(true);
    expect(canMoveUnder(d.categories, 'compras', 'ropa')).toBe(false); // la madre no cuelga de su hija
    expect(canMoveUnder(d.categories, 'groceries', 'ropa')).toBe(false); // ropa ya es subcategoría
    expect(canMoveUnder(d.categories, 'groceries', 'salary')).toBe(false); // distinto tipo
  });
  it('un presupuesto de la madre cuenta el gasto de sus subcategorías', () => {
    const d = montar();
    d.budgets = [{ id: 'b', categoryId: 'compras', limit: 10000, period: 'monthly', warnAt: 0.8, rollover: false } as never];
    expect(budgetStatus(d, '2026-10', 15)[0].spent).toBe(8000);
  });
  it('el informe agrupa por madre y suma ingresos y gastos', () => {
    const d = montar();
    const r = buildReport(d, ['2026-10']);
    expect(r.income).toBe(300000);
    expect(r.expenses).toBe(8000);
    expect(ranking(r.expenseByRoot)[0]).toMatchObject({ id: 'compras', value: 8000 });
    expect(monthsFor(d, '3', '2026-10-15')).toEqual(['2026-08', '2026-09', '2026-10']);
  });
  it('la estructura sugerida agrupa las categorías de serie sin tocar lo ya organizado', () => {
    const d = emptyData();
    const e = applySuggestedStructure(d);
    expect(e.categories.find((c) => c.id === 'groceries')?.parentId).toBe('fam_comida');
    expect(e.categories.some((c) => c.id === 'fam_comida')).toBe(true);
    expect(applySuggestedStructure(e)).toBe(e);
  });
});

describe('gastos y deudas compartidos entre usuarios', () => {
  const M = 'marcelo';
  const N = 'nicole';
  const e = (over: Partial<CloudEntry>): CloudEntry => ({ id: Math.random().toString(36), groupId: 'g', createdBy: M, kind: 'expense', payer: M, amount: 0, description: '', date: '2026-11-01', shares: {}, createdAt: '2026-11-01T10:00:00Z', ...over });
  it('un gasto pagado por ti y repartido a medias: ella te debe su mitad', () => {
    const bal = balances(toSharedExpenses([e({ amount: 10000, shares: { [M]: 5000, [N]: 5000 } })]), [M, N]);
    expect(bal).toEqual({ [M]: 5000, [N]: -5000 });
    expect(settleUp(bal)).toEqual([{ from: N, to: M, amount: 5000 }]);
  });
  it('una deuda tuya con Nicole y otra suya contigo se compensan', () => {
    const entries = [
      e({ kind: 'debt', payer: N, amount: 3000, shares: { [M]: 3000 } }), // yo le debo 30 a Nicole
      e({ kind: 'debt', payer: M, amount: 1200, shares: { [N]: 1200 } }), // Nicole me debe 12
    ];
    const bal = balances(toSharedExpenses(entries), [M, N]);
    expect(bal[M]).toBe(-1800);
    expect(settleUp(bal)).toEqual([{ from: M, to: N, amount: 1800 }]);
  });
  it('liquidar deja a todos en paz', () => {
    const entries = [e({ amount: 10000, shares: { [M]: 5000, [N]: 5000 } }), e({ kind: 'payment', payer: N, amount: 5000, shares: { [M]: 5000 } })];
    const bal = balances(toSharedExpenses(entries), [M, N]);
    expect(bal).toEqual({ [M]: 0, [N]: 0 });
    expect(toSharedExpenses(entries)[1].settlement).toBe(true);
  });
});

describe('valoración de bolívares con tasas de distinta antigüedad', () => {
  const T = '2026-11-03';
  const base = (rates: object[]) => {
    const d = emptyData();
    d.settings.currency = 'EUR';
    d.rates = rates.map((r, i) => ({ id: 'r' + i, ...r })) as never;
    return d;
  };
  const hoy = [
    { date: T, base: 'USD', quote: 'VES', rate: 891.11, source: 'BCV' },
    { date: T, base: 'EUR', quote: 'VES', rate: 997.92, source: 'Euro' },
  ];
  it('163.823,83 Bs valen 164,17 € a la tasa Euro BCV de hoy', () => {
    expect(convert(base(hoy), 16382383, 'VES', 'EUR', T)).toBe(16417);
  });
  it('un «Paralelo» antiguo (28 Bs/€) no le gana a la tasa BCV/Euro de hoy', () => {
    const d = base([{ date: '2025-06-01', base: 'USD', quote: 'VES', rate: 28, source: 'Paralelo' }, { date: '2025-06-01', base: 'EUR', quote: 'VES', rate: 28, source: 'Paralelo' }, ...hoy]);
    expect(convert(d, 16382383, 'VES', 'EUR', T)).toBe(16417);
    expect(convert(d, 16382383, 'VES', 'USD', T)).toBe(18384); // 183,84 $ a BCV 891,11
  });
  it('por defecto se usa la tasa oficial aunque haya un Paralelo al día; si eliges Paralelo, se respeta', () => {
    const d = base([{ date: T, base: 'USD', quote: 'VES', rate: 1100, source: 'Paralelo' }, ...hoy]);
    expect(convert(d, 16382383, 'VES', 'USD', T)).toBe(18384);
    d.settings = { ...d.settings, rateSource: { VES: 'Paralelo' } };
    expect(convert(d, 16382383, 'VES', 'USD', T)).toBe(14893); // 163.823,83 / 1100
  });
  it('si se pide una fuente concreta, se usa esa aunque sea antigua', () => {
    const d = base([{ date: '2025-06-01', base: 'USD', quote: 'VES', rate: 28, source: 'Paralelo' }, ...hoy]);
    expect(rateFor(d, 'USD', 'VES', T, 'Paralelo')).toBe(28);
  });
});

describe('guía de primer uso', () => {
  it('al terminar elimina lo creado como prueba y devuelve el saldo, y deja lo real', async () => {
    const { finishGuide, newGuide, patchGuide, guideActive, guideComplete } = await import('./guide');
    let d = emptyData();
    d.accounts = [{ id: 'a', name: 'Efectivo', kind: 'cash', balance: 10000, currency: 'EUR', source: 'manual' }];
    d = patchGuide(d, { ...newGuide('tasks') });
    expect(guideActive(d)).toBe(true);
    d = { ...d, accounts: [{ ...d.accounts[0], balance: 10000 - 500 + 300 }], transactions: [
      { id: 'tp', accountId: 'a', date: '2026-11-03', amount: -500, description: 'Prueba · café', categoryId: 'x', categorySource: 'user' },
      { id: 'tr', accountId: 'a', date: '2026-11-03', amount: 300, description: 'real', categoryId: 'x', categorySource: 'user' },
    ], budgets: [{ id: 'bp', categoryId: 'x', limit: 100, warnAt: 0.8, rollover: false }, { id: 'br', categoryId: 'y', limit: 100, warnAt: 0.8, rollover: false }] };
    d = patchGuide(d, { accounts: true, movement: true, budget: true, testTx: ['tp'], testBudgets: ['bp'] });
    expect(guideComplete(d.settings.guide)).toBe(true);
    const f = finishGuide(d);
    expect(f.transactions.map((t) => t.id)).toEqual(['tr']);
    expect(f.budgets.map((b) => b.id)).toEqual(['br']);
    expect(f.accounts[0].balance).toBe(10300);
    expect(guideActive(f)).toBe(false);
  });
});

describe('atajos con datos prellenados', () => {
  it('lee monto, comercio, tipo, moneda y cuenta del enlace', async () => {
    const { prefillFromUrl } = await import('./shortcut');
    expect(prefillFromUrl('?accion=nuevo&monto=%2425.50&comercio=Mercadona&tipo=ingreso&moneda=eur&cuenta=BBVA&fecha=2026-11-03')).toEqual({ amount: '25.50', merchant: 'Mercadona', kind: 'income', currency: 'EUR', account: 'BBVA', date: '2026-11-03' });
    expect(prefillFromUrl('?accion=escanear')).toEqual({ scan: true });
    expect(prefillFromUrl('?accion=voz')).toBeNull();
    expect(prefillFromUrl('')).toBeNull();
    expect(parseAmount('25.50')).toBe(2550);
    expect(parseAmount('25,50')).toBe(2550);
  });
});

describe('movimientos recurrentes', () => {
  it('calcula la siguiente fecha y respeta los meses cortos', async () => {
    const { nextOccurrence } = await import('./recurring');
    expect(nextOccurrence('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(nextOccurrence('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    expect(nextOccurrence('2026-12-15', 'monthly', 15)).toBe('2027-01-15');
    expect(nextOccurrence('2026-11-03', 'weekly', 3)).toBe('2026-11-10');
    expect(nextOccurrence('2028-02-29', 'yearly', 29)).toBe('2029-02-28');
  });
  it('crea los movimientos que tocan una sola vez, ajusta el saldo y no duplica', async () => {
    const { processRecurring } = await import('./recurring');
    let d = emptyData();
    d.accounts = [{ id: 'a', name: 'BBVA', kind: 'checking', balance: 100000, currency: 'EUR', source: 'manual' }];
    d.recurring = [{ id: 'r1', accountId: 'a', amount: -50000, description: 'Alquiler', categoryId: 'x', freq: 'monthly', next: '2026-09-01', day: 1, active: true }];
    const r = processRecurring(d, '2026-11-03');
    expect(r.created).toBe(3); // sept, oct, nov
    expect(r.data.accounts[0].balance).toBe(100000 - 150000);
    expect(r.data.recurring[0].next).toBe('2026-12-01');
    expect(r.data.transactions.map((t) => t.date)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    const again = processRecurring(r.data, '2026-11-03');
    expect(again.created).toBe(0);
    expect(again.data).toBe(r.data);
  });
  it('respeta la fecha final y se desactiva', async () => {
    const { processRecurring } = await import('./recurring');
    const d = emptyData();
    d.accounts = [{ id: 'a', name: 'x', kind: 'checking', balance: 0, currency: 'EUR', source: 'manual' }];
    d.recurring = [{ id: 'r', accountId: 'a', amount: 1000, description: 'Pago', categoryId: 'x', freq: 'monthly', next: '2026-09-10', day: 10, end: '2026-10-10', active: true }];
    const r = processRecurring(d, '2026-12-01');
    expect(r.created).toBe(2);
    expect(r.data.recurring[0].active).toBe(false);
  });
  it('al fusionar dos dispositivos que crearon el mismo recurrente, el saldo no se duplica', () => {
    const acc = (b: number) => [{ id: 'a', name: 'x', kind: 'checking' as const, balance: b, currency: 'EUR', source: 'manual' as const }];
    const tx = { id: 'rec-r-2026-11-01', accountId: 'a', date: '2026-11-01', amount: -500, description: 'Alquiler', categoryId: 'x', categorySource: 'rule' as const };
    const base = { ...emptyData(), accounts: acc(10000) };
    const local = { ...base, accounts: acc(9500), transactions: [tx] };
    const remote = { ...base, accounts: acc(9500), transactions: [tx] };
    const m = merge3(base, local, remote);
    expect(m.transactions).toHaveLength(1);
    expect(m.accounts[0].balance).toBe(9500);
  });
  it('si además un dispositivo anotó otro gasto, el recurrente duplicado solo se resta una vez', () => {
    const acc = (b: number) => [{ id: 'a', name: 'x', kind: 'checking' as const, balance: b, currency: 'EUR', source: 'manual' as const }];
    const rec = { id: 'rec-r-2026-11-01', accountId: 'a', date: '2026-11-01', amount: -500, description: 'Alquiler', categoryId: 'x', categorySource: 'rule' as const };
    const cafe = { id: 'c1', accountId: 'a', date: '2026-11-02', amount: -300, description: 'Café', categoryId: 'x', categorySource: 'user' as const };
    const base = { ...emptyData(), accounts: acc(10000) };
    const local = { ...base, accounts: acc(9200), transactions: [rec, cafe] };
    const remote = { ...base, accounts: acc(9500), transactions: [rec] };
    expect(merge3(base, local, remote).accounts[0].balance).toBe(9200);
  });
});

describe('editar movimientos y saldos negativos', () => {
  const base = () => {
    const d = emptyData();
    d.accounts = [
      { id: 'a', name: 'BBVA', kind: 'checking', balance: 10000, currency: 'EUR', source: 'manual' },
      { id: 'b', name: 'Efectivo', kind: 'cash', balance: -2500, currency: 'EUR', source: 'manual' },
      { id: 'v', name: 'Banesco', kind: 'checking', balance: 0, currency: 'VES', source: 'manual' },
    ];
    d.categories = [{ id: 'x', name: 'Café', icon: '', kind: 'expense' } as never, { id: 'y', name: 'Súper', icon: '', kind: 'expense' } as never];
    d.transactions = [{ id: 't', accountId: 'a', date: '2026-11-03', amount: -500, description: 'Cafe', categoryId: 'x', categorySource: 'rule' }];
    d.accounts[0].balance = 10000 - 500;
    return d;
  };
  it('cambiar el importe ajusta solo la diferencia en el saldo', async () => {
    const { editTransaction } = await import('./txedit');
    const e = editTransaction(base(), 't', { amount: -800 });
    expect(e.accounts[0].balance).toBe(10000 - 800);
    expect(e.transactions[0].amount).toBe(-800);
  });
  it('cambiar de cuenta devuelve el dinero a la anterior y lo cobra en la nueva (también con saldo negativo)', async () => {
    const { editTransaction } = await import('./txedit');
    const e = editTransaction(base(), 't', { accountId: 'b' });
    expect(e.accounts[0].balance).toBe(10000);
    expect(e.accounts[1].balance).toBe(-2500 - 500);
  });
  it('fecha, concepto y nota no tocan los saldos; la categoría cambia y se marca como del usuario', async () => {
    const { editTransaction } = await import('./txedit');
    const before = base();
    const e = editTransaction(before, 't', { date: '2026-10-30', description: 'Café con leche', note: 'n', categoryId: 'y' });
    expect(e.accounts.map((a) => a.balance)).toEqual(before.accounts.map((a) => a.balance));
    expect(e.transactions[0]).toMatchObject({ date: '2026-10-30', description: 'Café con leche', note: 'n', categoryId: 'y', categorySource: 'user' });
  });
  it('un movimiento inexistente o una cuenta inexistente no cambian nada', async () => {
    const { editTransaction } = await import('./txedit');
    const d = base();
    expect(editTransaction(d, 'nope', { amount: -1 })).toBe(d);
    expect(editTransaction(d, 't', { accountId: 'zzz' })).toBe(d);
  });
  it('el equivalente en otra moneda sigue la proporción al cambiar el importe', async () => {
    const { editTransaction } = await import('./txedit');
    const d = base();
    d.transactions = [{ id: 'f', accountId: 'v', date: '2026-11-03', amount: -94000, description: 'x', categoryId: 'x', categorySource: 'user', fx: { amount: 100, currency: 'USD', rate: 940 } }];
    const e = editTransaction(d, 'f', { amount: -188000 });
    expect(e.transactions[0].fx?.amount).toBe(200);
  });
  it('una cuenta con saldo negativo cuenta como pasivo en el patrimonio', () => {
    const d = base();
    const nw = netWorth(d);
    expect(nw.liabilities).toBe(2500);
    expect(nw.assets).toBe(9500);
  });
});

describe('deudas', () => {
  it('calcula pendiente, calendario del plan y próxima cuota', async () => {
    const { remainingOf, scheduleOf, statusOf } = await import('./debts');
    const debt = { id: 'd', direction: 'owe' as const, person: 'Banco', title: 'Préstamo', category: 'bank' as const, priority: 'high' as const, amount: 100000, currency: 'EUR', createdAt: '2026-01-01', payments: [{ id: 'p1', date: '2026-02-01', amount: 25000 }], plan: { amount: 25000, freq: 'monthly' as const, start: '2026-01-31' } };
    expect(remainingOf(debt)).toBe(75000);
    const s = scheduleOf(debt);
    expect(s.map((i) => i.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(s.map((i) => i.paid)).toEqual([true, false, false, false]);
    const st = statusOf(debt, '2026-03-01');
    expect(st.next?.date).toBe('2026-02-28');
    expect(st.overdue).toBe(true);
    expect(st.endsOn).toBe('2026-04-30');
  });
  it('la última cuota lleva el resto y una deuda pagada no está vencida', async () => {
    const { scheduleOf, statusOf, isSettled } = await import('./debts');
    const d = { id: 'd', direction: 'owed' as const, person: 'Ana', title: 'x', category: 'personal' as const, priority: 'low' as const, amount: 10000, currency: 'EUR', dueDate: '2026-01-01', createdAt: '2026-01-01', payments: [{ id: 'p', date: '2026-01-05', amount: 10000 }], plan: { amount: 4000, freq: 'weekly' as const, start: '2026-01-01' } };
    expect(scheduleOf({ ...d, payments: [] }).map((i) => i.amount)).toEqual([4000, 4000, 2000]);
    expect(isSettled(d)).toBe(true);
    expect(statusOf(d, '2026-12-01').overdue).toBe(false);
  });
  it('al fusionar dos dispositivos se unen los pagos de la misma deuda sin perder ninguno', () => {
    const debt = (payments: { id: string; date: string; amount: number }[]) => ({ id: 'd', direction: 'owe' as const, person: 'P', title: 't', category: 'other' as const, priority: 'medium' as const, amount: 50000, currency: 'EUR', createdAt: '2026-01-01', payments });
    const base = { ...emptyData(), debts: [debt([{ id: 'p0', date: '2026-01-01', amount: 1000 }])] };
    const local = { ...base, debts: [debt([{ id: 'p0', date: '2026-01-01', amount: 1000 }, { id: 'pl', date: '2026-02-01', amount: 2000 }])] };
    const remote = { ...base, debts: [debt([{ id: 'p0', date: '2026-01-01', amount: 1000 }, { id: 'pr', date: '2026-02-02', amount: 3000 }])] };
    const m = merge3(base, local, remote);
    expect(m.debts[0].payments.map((p) => p.id).sort()).toEqual(['p0', 'pl', 'pr']);
  });
});

describe('actualización de datos: nada se pierde', () => {
  it('un archivo de datos antiguo (sin deudas ni recurrentes) se abre completo y con sus saldos negativos', () => {
    const legacy = JSON.parse(JSON.stringify({ ...emptyData(), accounts: [{ id: 'e', name: 'Efectivo', kind: 'cash', balance: -15500, currency: 'EUR', source: 'manual' }], transactions: [{ id: 't1', accountId: 'e', date: '2026-10-01', amount: -15500, description: 'x', categoryId: 'other', categorySource: 'user' }], goals: [{ id: 'g', name: 'Viaje', target: 100000, saved: 5000, kind: 'savings' }] }));
    delete legacy.debts;
    delete legacy.recurring;
    const m = migrate(legacy);
    expect(m.debts).toEqual([]);
    expect(m.recurring).toEqual([]);
    expect(m.accounts[0].balance).toBe(-15500);
    expect(m.transactions).toHaveLength(1);
    expect(m.goals).toHaveLength(1);
  });
  it('fusionar con un blob antiguo de la nube (sin deudas) conserva las deudas locales', () => {
    const old = JSON.parse(JSON.stringify(emptyData()));
    delete old.debts;
    const local = { ...emptyData(), debts: [{ id: 'd', direction: 'owed' as const, person: 'Ana', title: 'Préstamo', category: 'personal' as const, priority: 'medium' as const, amount: 5000, currency: 'EUR', createdAt: '2026-01-01', payments: [] }] };
    const m = merge3(migrate(old), local, migrate(old));
    expect(m.debts).toHaveLength(1);
  });
});

describe('gastos compartidos: quien paga 100 a medias', () => {
  it('al otro le sale que debe 50 y al que pagó que le deben 50', async () => {
    const { splitEqual, balances, settleUp } = await import('./shared');
    const shares = splitEqual(10000, ['ana', 'leo']);
    const bal = balances([{ id: 'e', groupId: 'g', date: '2026-11-03', description: 'Cena', amount: 10000, paidBy: 'ana', shares }], ['ana', 'leo']);
    expect(bal).toEqual({ ana: 5000, leo: -5000 });
    expect(settleUp(bal)).toEqual([{ from: 'leo', to: 'ana', amount: 5000 }]);
  });
  it('con tres personas y céntimos impares la suma siempre cuadra', async () => {
    const { splitEqual, balances } = await import('./shared');
    const shares = splitEqual(10001, ['a', 'b', 'c']);
    const bal = balances([{ id: 'e', groupId: 'g', date: '2026-11-03', description: 'x', amount: 10001, paidBy: 'a', shares }], ['a', 'b', 'c']);
    expect(Object.values(bal).reduce((s, v) => s + v, 0)).toBe(0);
  });
});
