import { emptyData } from './defaults';
import { addRate, recordExchange } from './fx';
import { mergeMovements, type RawMovement } from './importer';
import { addMonths } from './money';
import type { AppData } from './types';

/** Genera 4 meses de datos realistas para probar la app sin conectar nada. */
export function demoData(asOf: string): AppData {
  let data = emptyData();
  data.accounts = [
    { id: 'main', name: 'Cuenta nómina', kind: 'checking', balance: 0, currency: 'EUR', source: 'import' },
    { id: 'savings', name: 'Cuenta ahorro', kind: 'savings', balance: 420000, currency: 'EUR', source: 'manual' },
    { id: 'cash', name: 'Efectivo', kind: 'cash', balance: 6000, currency: 'EUR', source: 'manual' },
    { id: 'funds', name: 'Fondo indexado', kind: 'investment', balance: 830000, currency: 'EUR', source: 'manual' },
    { id: 'btc', name: 'Bitcoin', kind: 'crypto', balance: 120000, currency: 'EUR', source: 'manual' },
    { id: 'car', name: 'Préstamo coche', kind: 'loan', balance: -640000, currency: 'EUR', source: 'manual' },
    { id: 'ves', name: 'Banesco (Bs)', kind: 'checking', balance: 0, currency: 'VES', source: 'manual' },
    { id: 'usd', name: 'Wise USD', kind: 'checking', balance: 15000, currency: 'USD', source: 'manual' },
  ];

  const month = asOf.slice(0, 7);
  const lastDay = Number(asOf.slice(8, 10));
  const movs: RawMovement[] = [{ date: `${addMonths(month, -4)}-01`, amount: 150000, description: 'Saldo inicial' }];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (let i = 3; i >= 0; i--) {
    const m = addMonths(month, -i);
    const d = (day: number) => `${m}-${String(day).padStart(2, '0')}`;
    const until = i === 0 ? lastDay : 31;
    const add = (day: number, amount: number, description: string) => {
      if (day <= until && day <= 28) movs.push({ date: d(day), amount, description });
    };
    add(1, 245000, 'NOMINA ACME SOLUCIONES SL');
    add(2, -85000, 'RECIBO ALQUILER PISO');
    add(3, -1299, 'COMPRA NETFLIX.COM');
    add(5, -1099, 'COMPRA SPOTIFY P1234567');
    add(6, -3990, 'RECIBO BASIC FIT SPAIN');
    add(8, -4500, 'RECIBO MOVISTAR');
    add(10, -6230 - Math.round(rnd() * 2000), 'RECIBO IBERDROLA CLIENTES');
    add(12, -2400, 'RECIBO MAPFRE SEGUROS HOGAR');
    add(15, -600, 'COMISION MANTENIMIENTO CUENTA');
    add(20, -27500, 'RECIBO PRESTAMO COCHE');
    add(20, 27500, 'TRASPASO PRESTAMO COCHE');
    for (let w = 0; w < 4; w++) {
      add(4 + w * 7, -(5200 + Math.round(rnd() * 3000)), 'COMPRA MERCADONA 2342 MADRID');
      add(6 + w * 7, -(1500 + Math.round(rnd() * 3000)), 'COMPRA CARREFOUR EXPRESS');
      add(7 + w * 7, -(2500 + Math.round(rnd() * 3500)), 'COMPRA RESTAURANTE LA TABERNA');
      add(5 + w * 7, -(3000 + Math.round(rnd() * 1500)), 'COMPRA REPSOL ESTACION');
    }
    for (let k = 1; k <= 26; k += 2) add(k, -(180 + Math.round(rnd() * 170)), 'COMPRA CAFETERIA EL RINCON');
    for (let k = 3; k <= 26; k += 5) add(k, -(250 + Math.round(rnd() * 300)), 'COMPRA VENDING SNACKS');
    add(9, -1500, 'BIZUM ENVIADO A LAURA CENA');
    add(18, 2000, 'BIZUM RECIBIDO DE PABLO');
    add(14, -(4000 + Math.round(rnd() * 6000)), 'COMPRA AMAZON EU SARL');
    add(16, -1240, 'COMPRA METRO DE MADRID');
    add(22, -6000, 'RETIRADA EFECTIVO CAJERO');
    add(24, -(1500 + Math.round(rnd() * 2000)), 'COMPRA CINESA PROYECCIONES');
  }

  data = mergeMovements(data, 'main', movs).data;
  data.transactions = data.transactions.map((t) =>
    /PRESTAMO COCHE/.test(t.description) ? { ...t, categoryId: t.amount > 0 ? 'transfer' : 'home' } : t,
  );

  // Divisas: cobro de 800 $ en bolívares a tasa BCV, compra de dólares en
  // el paralelo y envío a euros por Wise.
  for (let i = 3; i >= 0; i--) {
    const m = addMonths(month, -i);
    const bcv = 200 + (3 - i) * 12;
    const par = bcv * 1.38;
    const day = (n: number) => `${m}-${String(Math.min(n, i === 0 ? lastDay : 28)).padStart(2, '0')}`;
    data = addRate(data, { date: day(1), base: 'USD', quote: 'VES', rate: bcv, source: 'BCV' });
    data = addRate(data, { date: day(1), base: 'USD', quote: 'VES', rate: Math.round(par * 100) / 100, source: 'Paralelo' });
    data = addRate(data, { date: day(1), base: 'EUR', quote: 'USD', rate: 1.085, source: 'Mercado medio' });
    if (i === 0 && lastDay < 5) continue;
    const ves = Math.round(80000 * bcv);
    data = mergeMovements(data, 'ves', [{ date: day(5), amount: ves, description: 'PAGO CLIENTE VENEZUELA' }]).data;
    data.transactions = data.transactions.map((t) =>
      t.accountId === 'ves' && t.date === day(5) && t.amount === ves ? { ...t, categoryId: 'freelance', categorySource: 'user', fx: { amount: 80000, currency: 'USD', rate: bcv, source: 'BCV' } } : t,
    );
    // En P2P se compra algo por encima del paralelo (spread del 1 %).
    const usd = Math.round(ves / (par * 1.01));
    data = recordExchange(data, { date: day(6), fromAccountId: 'ves', fromAmount: ves, toAccountId: 'usd', toAmount: usd, fee: 0, platform: 'Binance P2P', referenceRate: 1 / par, referenceSource: 'Paralelo' });
    const sent = usd - 2000;
    data = recordExchange(data, { date: day(7), fromAccountId: 'usd', fromAmount: sent, toAccountId: 'main', toAmount: Math.round((sent - 450) / 1.092), fee: 450, platform: 'Wise', referenceRate: 1 / 1.085, referenceSource: 'Mercado medio' });
  }
  data.settings = { ...data.settings, rateSource: { VES: 'Paralelo' } };

  data.budgets = [
    { id: 'b1', categoryId: 'groceries', limit: 35000, warnAt: 0.8, rollover: false },
    { id: 'b2', categoryId: 'restaurants', limit: 15000, warnAt: 0.8, rollover: false },
    { id: 'b3', categoryId: 'coffee', limit: 3000, warnAt: 0.8, rollover: false },
    { id: 'b4', categoryId: 'leisure', limit: 5000, warnAt: 0.8, rollover: true },
  ];
  data.goals = [
    { id: 'g1', name: 'Fondo de emergencia', icon: '🛟', target: 900000, saved: 350000, priority: 1 },
    { id: 'g2', name: 'Vacaciones verano', icon: '🏖️', target: 180000, saved: 45000, deadline: `${addMonths(month, 8)}-01`, priority: 2 },
    { id: 'g3', name: 'Impuestos (IRPF)', icon: '🧾', target: 60000, saved: 20000, priority: 3 },
  ];
  data.savingsRules = { enabled: true, roundUp: true, roundUpTo: 100, percentOfIncome: 5, smartSave: true };
  data.groups = [{ id: 'piso', name: 'Piso compartido', members: ['Yo', 'Laura', 'Pablo'] }];
  data.sharedExpenses = [
    { id: 's1', groupId: 'piso', date: `${month}-02`, description: 'Compra limpieza', amount: 3600, paidBy: 'Yo', shares: { Yo: 1200, Laura: 1200, Pablo: 1200 } },
    { id: 's2', groupId: 'piso', date: `${month}-03`, description: 'Internet fibra', amount: 4500, paidBy: 'Laura', shares: { Yo: 1500, Laura: 1500, Pablo: 1500 } },
    { id: 's3', groupId: 'piso', date: `${month}-04`, description: 'Pizza viernes', amount: 4200, paidBy: 'Pablo', shares: { Yo: 2100, Laura: 2100, Pablo: 0 } },
  ];
  data.settings = { ...data.settings, offlineOnly: true };
  data.goals = data.goals.map((g) => (g.id === 'g1' ? { ...g, kind: 'savings', deadline: `${addMonths(month, 12)}-01`, monthlyPlan: 40000, startDate: `${addMonths(month, -4)}-01`, startAmount: 200000 } : g));
  data.goals.push({ id: 'g4', name: 'Cartera indexada 20k', icon: '📈', kind: 'investment', target: 2000000, saved: 0, accountIds: ['funds'], expectedReturn: 6, monthlyPlan: 20000, deadline: `${addMonths(month, 48)}-01`, priority: 4, startDate: `${addMonths(month, -4)}-01`, startAmount: 750000 });
  data.goalMovements = [1, 2, 3].flatMap((i) => [
    { id: `gm1-${i}`, goalId: 'g1', date: `${addMonths(month, -i)}-10`, amount: 40000, reason: 'manual' as const },
    { id: `gm2-${i}`, goalId: 'g2', date: `${addMonths(month, -i)}-10`, amount: 15000, reason: 'manual' as const },
  ]);
  return data;
}
