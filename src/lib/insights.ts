import { toBase, txBase, txCurrency } from './fx';
import { daysBetween, merchantKey, monthKey, normalize } from './money';
import type { AppData, Transaction } from './types';

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Subscription {
  key: string;
  name: string;
  categoryId: string;
  frequency: Frequency;
  /** 'subscription' = servicio cancelable (Netflix, gimnasio...); 'bill' = recibo fijo (alquiler, luz, seguro...). */
  kind: 'subscription' | 'bill';
  /** Importe medio por cobro (céntimos, positivo). */
  amount: number;
  /** Coste anualizado (céntimos de `currency`). */
  yearly: number;
  currency: string;
  /** Coste anualizado en la moneda principal. */
  yearlyBase: number;
  lastDate: string;
  nextDate: string;
  count: number;
  /** El último cobro subió respecto a la media anterior. */
  priceIncrease?: number;
  transactionIds: string[];
}

const PERIODS: [Frequency, number, number][] = [
  ['weekly', 7, 2],
  ['monthly', 30.4, 5],
  ['quarterly', 91, 12],
  ['yearly', 365, 25],
];

const BILL_CATEGORIES = new Set(['subscriptions', 'utilities', 'telecom', 'insurance', 'home', 'sport', 'education', 'fees', 'taxes']);

const FIXED_BILLS = new Set(['home', 'utilities', 'insurance', 'taxes', 'fees', 'other', 'transfer']);

const PER_YEAR: Record<Frequency, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1 };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Detecta cobros recurrentes: mismo comercio, importe parecido (±15 %) e
 * intervalos regulares entre cargos.
 */
export function detectSubscriptions(data: AppData): Subscription[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of data.transactions) {
    if (t.amount >= 0 || t.channel === 'bizum' || t.channel === 'atm' || t.categoryId === 'transfer' || t.exchangeId) continue;
    const merchant = merchantKey(t.description);
    if (!merchant) continue;
    const key = `${merchant}|${txCurrency(data, t)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const result: Subscription[] = [];
  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;
    txs.sort((a, b) => a.date.localeCompare(b.date));
    const amounts = txs.map((t) => -t.amount);
    const med = median(amounts);
    // Los recibos (luz, móvil...) varían algo; una compra habitual solo cuenta si el importe es casi fijo.
    const tolerance = BILL_CATEGORIES.has(txs[txs.length - 1].categoryId) ? 0.15 : 0.03;
    const similar = txs.filter((t) => Math.abs(-t.amount - med) <= med * tolerance);
    if (similar.length < 2) continue;

    const gaps = similar.slice(1).map((t, i) => daysBetween(similar[i].date, t.date));
    const gap = median(gaps);
    const period = PERIODS.find(([, days, tol]) => Math.abs(gap - days) <= tol);
    if (!period) continue;
    // Los intervalos deben ser consistentes, no solo la mediana.
    const [frequency, days, tol] = period;
    if (gaps.filter((g) => Math.abs(g - days) <= tol * 1.5).length < Math.ceil(gaps.length * 0.7)) continue;
    const last = similar[similar.length - 1];

    const avg = Math.round(similar.reduce((s, t) => s - t.amount, 0) / similar.length);
    const prev = similar.slice(0, -1);
    const prevAvg = prev.reduce((s, t) => s - t.amount, 0) / prev.length;
    const lastAmount = -last.amount;
    const next = new Date(Date.parse(last.date) + Math.round(days) * 86_400_000).toISOString().slice(0, 10);

    const currency = txCurrency(data, last);
    result.push({
      key: key.split('|')[0],
      name: prettyName(last.description),
      categoryId: last.categoryId,
      frequency,
      kind: FIXED_BILLS.has(last.categoryId) ? 'bill' : 'subscription',
      amount: avg,
      yearly: avg * PER_YEAR[frequency],
      currency,
      yearlyBase: toBase(data, avg * PER_YEAR[frequency], currency, last.date),
      lastDate: last.date,
      nextDate: next,
      count: similar.length,
      priceIncrease: lastAmount > prevAvg * 1.02 ? Math.round(lastAmount - prevAvg) : undefined,
      transactionIds: similar.map((t) => t.id),
    });
  }
  return result.sort((a, b) => b.yearly - a.yearly);
}

export function isActive(sub: Subscription, asOf: string): boolean {
  const days = PERIODS.find(([f]) => f === sub.frequency)![1];
  return daysBetween(sub.lastDate, asOf) <= days * 2;
}

function prettyName(description: string): string {
  const k = merchantKey(description);
  return k.replace(/\b\w/g, (c) => c.toUpperCase()) || description;
}

export interface FeeAlert {
  transactionId: string;
  date: string;
  amount: number;
  currency: string;
  amountBase: number;
  description: string;
  kind: 'maintenance' | 'card' | 'overdraft' | 'atm' | 'transfer' | 'fx' | 'other';
}

const FEE_PATTERNS: [RegExp, FeeAlert['kind']][] = [
  [/mantenimiento|cuota (de )?cuenta|administracion/, 'maintenance'],
  [/cuota (anual )?tarjeta|emision tarjeta|renovacion tarjeta/, 'card'],
  [/descubierto|intereses deudores|reclamacion (posicion|deuda)/, 'overdraft'],
  [/comision (cajero|reintegro|retirada)|cajero ajeno/, 'atm'],
  [/comision (transferencia|traspaso)/, 'transfer'],
  [/cambio de divisa|tipo de cambio|comision divisa|foreign|fx fee/, 'fx'],
  [/\bcomision|\bcomisiones|\bfee\b/, 'other'],
];

export function detectFees(data: AppData): FeeAlert[] {
  const out: FeeAlert[] = [];
  for (const t of data.transactions) {
    if (t.amount >= 0 || t.exchangeId) continue;
    const text = normalize(t.description);
    const hit = FEE_PATTERNS.find(([re]) => re.test(text));
    if (hit || t.categoryId === 'fees') {
      const currency = txCurrency(data, t);
      out.push({ transactionId: t.id, date: t.date, amount: -t.amount, currency, amountBase: toBase(data, -t.amount, currency, t.date), description: t.description, kind: hit?.[1] ?? 'other' });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export const FEE_TIPS: Record<FeeAlert['kind'], string> = {
  maintenance: 'Muchos bancos online (y los tradicionales si domicilias la nómina) no cobran mantenimiento. Pide la exención o cambia de cuenta.',
  card: 'Hay tarjetas de débito y crédito sin cuota anual. Reclama la bonificación o pide una tarjeta gratuita.',
  overdraft: 'Los descubiertos tienen intereses muy altos. Configura un aviso de saldo bajo o un colchón en la hucha de emergencia.',
  atm: 'Usa cajeros de tu red o una cuenta que no cobre retiradas. Retirar menos veces y más cantidad también ayuda.',
  transfer: 'Las transferencias SEPA y las inmediatas suelen ser gratuitas en banca online. Revisa tu tarifa.',
  fx: 'Para pagos en otra divisa, una tarjeta sin comisión de cambio puede ahorrarte un 2-3 % de cada compra.',
  other: 'Revisa este cargo con tu banco: muchas comisiones se pueden negociar o evitar.',
};

export interface AntExpenses {
  /** Total de pequeños gastos en el periodo (céntimos, positivo). */
  total: number;
  count: number;
  /** Proyección a 12 meses si se mantiene el ritmo. */
  yearly: number;
  byMerchant: { key: string; name: string; total: number; count: number }[];
}

/**
 * Gastos "hormiga": compras pequeñas (≤ umbral) y frecuentes que, sumadas,
 * pesan mucho. Se analizan los últimos `days` días.
 */
export function detectAntExpenses(
  data: AppData,
  asOf: string,
  { threshold = 1000, days = 30 } = {},
): AntExpenses {
  // Importes en moneda principal: 10 € y 10 Bs no son lo mismo.
  const base = (t: Transaction) => -txBase(data, t);
  const small = data.transactions.filter(
    (t) =>
      t.amount < 0 &&
      !t.exchangeId &&
      base(t) <= threshold &&
      t.channel !== 'bizum' &&
      !['transfer', 'fees', 'subscriptions'].includes(t.categoryId) &&
      daysBetween(t.date, asOf) >= 0 &&
      daysBetween(t.date, asOf) < days,
  );
  const by = new Map<string, { key: string; name: string; total: number; count: number }>();
  for (const t of small) {
    const key = merchantKey(t.description) || t.categoryId;
    const e = by.get(key) ?? { key, name: prettyName(t.description), total: 0, count: 0 };
    e.total += base(t);
    e.count++;
    by.set(key, e);
  }
  // Solo cuentan los comercios repetidos: un gasto pequeño aislado no es una fuga.
  const byMerchant = [...by.values()].filter((m) => m.count >= 3).sort((a, b) => b.total - a.total);
  const total = byMerchant.reduce((s, m) => s + m.total, 0);
  const count = byMerchant.reduce((s, m) => s + m.count, 0);
  return { total, count, yearly: Math.round((total / days) * 365), byMerchant };
}

export interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  byCategory: Record<string, number>;
  /** Monedas sin tasa de cambio conocida (no se han podido sumar). */
  missingRates: Set<string>;
}

/** Ingresos y gastos del mes, convertidos a la moneda principal. */
export function monthSummary(data: Pick<AppData, 'transactions' | 'categories' | 'accounts' | 'rates' | 'settings'>, month: string): MonthSummary {
  const kinds = new Map(data.categories.map((c) => [c.id, c.kind]));
  const s: MonthSummary = { month, income: 0, expenses: 0, byCategory: {}, missingRates: new Set() };
  for (const t of data.transactions) {
    if (monthKey(t.date) !== month) continue;
    const kind = kinds.get(t.categoryId);
    if (kind === 'transfer') continue;
    const amount = txBase(data, t, s.missingRates);
    if (t.amount >= 0 && kind !== 'expense') s.income += amount;
    else {
      // Un ingreso en una categoría de gasto (p. ej. devolución) resta del gasto.
      s.expenses -= amount;
      s.byCategory[t.categoryId] = (s.byCategory[t.categoryId] ?? 0) - amount;
    }
  }
  return s;
}
