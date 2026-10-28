import { monthKey, uid } from './money';
import type { AppData, Exchange, RateQuote, Transaction } from './types';

// Multimoneda y análisis de cambio de divisa.
//
// Convención: una cotización dice que 1 `base` = `rate` `quote`
// (ej. base USD, quote VES, rate 40,5 → "40,5 Bs por dólar").

export interface CurrencyInfo {
  code: string;
  name: string;
  flag: string;
  /** No es ISO 4217: Intl no sabe formatearla. */
  custom?: boolean;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'USD', name: 'Dólar estadounidense', flag: '🇺🇸' },
  { code: 'VES', name: 'Bolívar venezolano', flag: '🇻🇪' },
  { code: 'USDT', name: 'Tether (USDT)', flag: '🪙', custom: true },
  { code: 'USDC', name: 'USD Coin', flag: '🪙', custom: true },
  { code: 'COP', name: 'Peso colombiano', flag: '🇨🇴' },
  { code: 'MXN', name: 'Peso mexicano', flag: '🇲🇽' },
  { code: 'ARS', name: 'Peso argentino', flag: '🇦🇷' },
  { code: 'CLP', name: 'Peso chileno', flag: '🇨🇱' },
  { code: 'PEN', name: 'Sol peruano', flag: '🇵🇪' },
  { code: 'BRL', name: 'Real brasileño', flag: '🇧🇷' },
  { code: 'GBP', name: 'Libra esterlina', flag: '🇬🇧' },
  { code: 'CHF', name: 'Franco suizo', flag: '🇨🇭' },
  { code: 'CAD', name: 'Dólar canadiense', flag: '🇨🇦' },
  { code: 'DOP', name: 'Peso dominicano', flag: '🇩🇴' },
  { code: 'PAB', name: 'Balboa panameño', flag: '🇵🇦' },
];

export const RATE_SOURCES = ['BCV', 'Paralelo', 'Binance P2P', 'Wise', 'Mercado medio', 'Banco', 'Manual'];

export const PLATFORMS = ['Wise', 'Binance P2P', 'Mercado paralelo', 'Zinli', 'Zelle', 'Banco', 'Casa de cambio', 'Western Union', 'Remitly', 'Revolut', 'Efectivo', 'Otra'];

export const currencyInfo = (code: string): CurrencyInfo =>
  CURRENCIES.find((c) => c.code === code) ?? { code, name: code, flag: '💱', custom: true };

const sameDayOrBefore = (q: RateQuote, date: string) => q.date <= date;

/** Busca la cotización directa más reciente (en la fecha o antes) entre dos monedas. */
function direct(rates: RateQuote[], from: string, to: string, date: string, source?: string): number | null {
  let best: { date: string; rate: number } | null = null;
  let fallback: { date: string; rate: number } | null = null;
  for (const q of rates) {
    if (source && q.source !== source) continue;
    let r: number | null = null;
    if (q.base === from && q.quote === to) r = q.rate;
    else if (q.base === to && q.quote === from && q.rate) r = 1 / q.rate;
    if (r === null) continue;
    if (sameDayOrBefore(q, date)) {
      if (!best || q.date > best.date) best = { date: q.date, rate: r };
    } else if (!fallback || q.date < fallback.date) fallback = { date: q.date, rate: r };
  }
  return (best ?? fallback)?.rate ?? null;
}

const PEGGED: Record<string, string> = { USDT: 'USD', USDC: 'USD', PAB: 'USD' };

/**
 * Tasa para convertir 1 `from` en `to` en una fecha. Usa la fuente preferida
 * (p. ej. Paralelo para VES) si existe; si no, cualquier fuente; si tampoco,
 * cruza a través del USD. Las stablecoins se tratan 1:1 con el dólar.
 */
export function rateFor(
  data: Pick<AppData, 'rates' | 'settings'>,
  from: string,
  to: string,
  date: string,
  source?: string,
): number | null {
  if (from === to) return 1;
  const f = PEGGED[from] ?? from;
  const t = PEGGED[to] ?? to;
  if (f === t) return 1;
  const pref = source ?? data.settings.rateSource?.[f === data.settings.currency ? t : f] ?? data.settings.rateSource?.[t];
  const tryPair = (a: string, b: string) => (pref ? direct(data.rates, a, b, date, pref) : null) ?? direct(data.rates, a, b, date);
  const d = tryPair(f, t);
  if (d !== null) return d;
  for (const via of ['USD', 'EUR']) {
    if (via === f || via === t) continue;
    const a = tryPair(f, via);
    const b = tryPair(via, t);
    if (a !== null && b !== null) return a * b;
  }
  return null;
}

/** Convierte céntimos de una moneda a otra. Devuelve null si no hay tasa. */
export function convert(data: Pick<AppData, 'rates' | 'settings'>, cents: number, from: string, to: string, date: string, source?: string): number | null {
  const r = rateFor(data, from, to, date, source);
  return r === null ? null : Math.round(cents * r);
}

/** Convierte a la moneda principal; sin tasa conocida devuelve 0 y lo anota en `missing`. */
export function toBase(data: Pick<AppData, 'rates' | 'settings'>, cents: number, currency: string, date: string, missing?: Set<string>): number {
  const base = data.settings.currency;
  if (currency === base) return cents;
  const v = convert(data, cents, currency, base, date);
  if (v === null) {
    missing?.add(currency);
    return 0;
  }
  return v;
}

export function accountCurrency(data: Pick<AppData, 'accounts' | 'settings'>, accountId: string): string {
  return data.accounts.find((a) => a.id === accountId)?.currency ?? data.settings.currency;
}

export function txCurrency(data: Pick<AppData, 'accounts' | 'settings'>, t: Transaction): string {
  return accountCurrency(data, t.accountId);
}

export function addRate(data: AppData, q: Omit<RateQuote, 'id'>): AppData {
  // Una sola cotización por día, par y fuente: la nueva sustituye a la anterior.
  const rates = data.rates.filter((r) => !(r.date === q.date && r.source === q.source && ((r.base === q.base && r.quote === q.quote) || (r.base === q.quote && r.quote === q.base))));
  return { ...data, rates: [...rates, { ...q, id: uid() }] };
}

// ---------- Cambios de divisa ----------

export interface ExchangeAnalysis {
  exchange: Exchange;
  from: string;
  to: string;
  /** Unidades de destino por 1 de origen que obtuviste de verdad. */
  effectiveRate: number;
  referenceRate: number | null;
  referenceSource?: string;
  /** Lo que habrías recibido a la tasa de referencia (céntimos destino). */
  expected: number | null;
  /** Recibido − esperado (negativo = pérdida), en moneda destino. */
  diff: number | null;
  diffPct: number | null;
  /** La diferencia en moneda principal. */
  diffBase: number | null;
  feePct: number;
}

export function analyzeExchange(data: AppData, ex: Exchange): ExchangeAnalysis {
  const from = accountCurrency(data, ex.fromAccountId);
  const to = accountCurrency(data, ex.toAccountId);
  const effectiveRate = ex.fromAmount ? ex.toAmount / ex.fromAmount : 0;
  const referenceRate = ex.referenceRate ?? rateFor(data, from, to, ex.date);
  const expected = referenceRate === null ? null : Math.round(ex.fromAmount * referenceRate);
  const diff = expected === null ? null : ex.toAmount - expected;
  return {
    exchange: ex,
    from,
    to,
    effectiveRate,
    referenceRate,
    referenceSource: ex.referenceRate ? ex.referenceSource : 'tasa guardada',
    expected,
    diff,
    diffPct: expected ? (diff ?? 0) / expected : null,
    diffBase: diff === null ? null : toBase(data, diff, to, ex.date),
    feePct: ex.fromAmount ? ex.fee / ex.fromAmount : 0,
  };
}

/** Registra un cambio: crea la salida y la entrada en cada cuenta y ajusta saldos. */
export function recordExchange(data: AppData, ex: Omit<Exchange, 'id'>): AppData {
  const id = uid();
  const full: Exchange = { ...ex, id };
  const desc = `Cambio ${ex.platform}`;
  const txs: Transaction[] = [
    { id: uid(), accountId: ex.fromAccountId, date: ex.date, amount: -ex.fromAmount, description: desc, categoryId: 'exchange', categorySource: 'user', channel: 'transfer', exchangeId: id },
    { id: uid(), accountId: ex.toAccountId, date: ex.date, amount: ex.toAmount, description: desc, categoryId: 'exchange', categorySource: 'user', channel: 'transfer', exchangeId: id },
  ];
  return {
    ...data,
    exchanges: [...data.exchanges, full],
    transactions: [...data.transactions, ...txs],
    accounts: data.accounts.map((a) =>
      a.id === ex.fromAccountId ? { ...a, balance: a.balance - ex.fromAmount } : a.id === ex.toAccountId ? { ...a, balance: a.balance + ex.toAmount } : a,
    ),
  };
}

export function deleteExchange(data: AppData, id: string): AppData {
  const ex = data.exchanges.find((e) => e.id === id);
  if (!ex) return data;
  return {
    ...data,
    exchanges: data.exchanges.filter((e) => e.id !== id),
    transactions: data.transactions.filter((t) => t.exchangeId !== id),
    accounts: data.accounts.map((a) =>
      a.id === ex.fromAccountId ? { ...a, balance: a.balance + ex.fromAmount } : a.id === ex.toAccountId ? { ...a, balance: a.balance - ex.toAmount } : a,
    ),
  };
}

// ---------- Ingresos cobrados a tasa oficial ----------

export interface IncomeFxAnalysis {
  transaction: Transaction;
  /** Lo que se te debía, en su moneda (ej. 800 USD). */
  nominal: number;
  nominalCurrency: string;
  /** Lo que llegó (ej. 32.400 Bs). */
  received: number;
  receivedCurrency: string;
  /** Tasa a la que te pagaron (ej. BCV 40,5). */
  paidRate: number;
  /** Tasa de mercado con la que valoras lo recibido (ej. Paralelo 50). */
  marketRate: number | null;
  marketSource?: string;
  /** Valor real de lo recibido en la moneda nominal (ej. 648 USD). */
  realValue: number | null;
  /** realValue − nominal (negativo = pérdida). */
  diff: number | null;
  diffPct: number | null;
  diffBase: number | null;
}

/**
 * ¿Cuánto vale de verdad un ingreso cobrado a una tasa oficial? Compara la
 * tasa a la que te pagaron con la tasa de mercado (fuente preferida de la
 * moneda recibida, p. ej. Paralelo para VES).
 */
export function analyzeIncomeFx(data: AppData, t: Transaction, marketSource?: string): IncomeFxAnalysis | null {
  if (!t.fx) return null;
  const receivedCurrency = txCurrency(data, t);
  const source = marketSource ?? data.settings.rateSource?.[receivedCurrency];
  // Tasa de mercado expresada como "moneda recibida por 1 moneda nominal".
  const market = rateFor(data, t.fx.currency, receivedCurrency, t.date, source);
  const realValue = market ? Math.round(Math.abs(t.amount) / market) : null;
  const nominal = Math.abs(t.fx.amount);
  const diff = realValue === null ? null : realValue - nominal;
  return {
    transaction: t,
    nominal,
    nominalCurrency: t.fx.currency,
    received: Math.abs(t.amount),
    receivedCurrency,
    paidRate: t.fx.rate,
    marketRate: market,
    marketSource: source,
    realValue,
    diff,
    diffPct: diff === null ? null : diff / nominal,
    diffBase: diff === null ? null : toBase(data, diff, t.fx.currency, t.date),
  };
}

export interface FxSummary {
  exchanges: ExchangeAnalysis[];
  incomes: IncomeFxAnalysis[];
  /** Pérdida (negativo) o ganancia total en moneda principal. */
  total: number;
  fees: number;
  byPlatform: { platform: string; count: number; diffBase: number; avgPct: number }[];
}

export function fxSummary(data: AppData, fromMonth?: string): FxSummary {
  const inRange = (d: string) => !fromMonth || monthKey(d) >= fromMonth;
  const exchanges = data.exchanges.filter((e) => inRange(e.date)).map((e) => analyzeExchange(data, e)).sort((a, b) => b.exchange.date.localeCompare(a.exchange.date));
  const incomes = data.transactions
    .filter((t) => t.fx && t.amount > 0 && inRange(t.date))
    .map((t) => analyzeIncomeFx(data, t)!)
    .sort((a, b) => b.transaction.date.localeCompare(a.transaction.date));
  const fees = exchanges.reduce((s, e) => s + toBase(data, e.exchange.fee, e.from, e.exchange.date), 0);
  const total = exchanges.reduce((s, e) => s + (e.diffBase ?? 0), 0) + incomes.reduce((s, i) => s + (i.diffBase ?? 0), 0);
  const by = new Map<string, { platform: string; count: number; diffBase: number; pcts: number[] }>();
  for (const e of exchanges) {
    const p = by.get(e.exchange.platform) ?? { platform: e.exchange.platform, count: 0, diffBase: 0, pcts: [] };
    p.count++;
    p.diffBase += e.diffBase ?? 0;
    if (e.diffPct !== null) p.pcts.push(e.diffPct);
    by.set(e.exchange.platform, p);
  }
  return {
    exchanges,
    incomes,
    total,
    fees,
    byPlatform: [...by.values()]
      .map((p) => ({ platform: p.platform, count: p.count, diffBase: p.diffBase, avgPct: p.pcts.length ? p.pcts.reduce((a, b) => a + b, 0) / p.pcts.length : 0 }))
      .sort((a, b) => a.avgPct - b.avgPct),
  };
}

// ---------- Simulador de la "ruta del dinero" ----------

export interface ChainStep {
  label: string;
  to: string;
  /** Unidades de `to` por 1 unidad de la moneda anterior. */
  rate: number;
  /** Comisión porcentual (0-1) sobre lo que entra en el paso. */
  feePct?: number;
  /** Comisión fija en la moneda anterior (céntimos). */
  feeFixed?: number;
}

export interface ChainResult {
  label: string;
  currency: string;
  amount: number;
  /** Valor del resultado en la moneda inicial, a tasas de valoración. */
  value: number;
  /** Pérdida (negativo) de este paso en moneda inicial. */
  stepDiff: number;
  totalDiff: number;
}

/**
 * Sigue el dinero por varios cambios (ej. 800 $ → Bs a tasa BCV → $ a tasa
 * paralela → € en Wise) y calcula cuánto se pierde en cada paso, valorando
 * cada moneda con `valuation` (unidades de esa moneda por 1 de la inicial).
 */
export function simulateChain(start: { amount: number; currency: string }, steps: ChainStep[], valuation: Record<string, number>): ChainResult[] {
  const valueOf = (amount: number, currency: string) => {
    if (currency === start.currency) return amount;
    const v = valuation[currency];
    return v ? Math.round(amount / v) : NaN;
  };
  const out: ChainResult[] = [{ label: 'Inicio', currency: start.currency, amount: start.amount, value: start.amount, stepDiff: 0, totalDiff: 0 }];
  let amount = start.amount;
  let prevValue = start.amount;
  for (const s of steps) {
    const afterFee = Math.max(0, amount - (s.feeFixed ?? 0)) * (1 - (s.feePct ?? 0));
    amount = Math.round(afterFee * s.rate);
    const value = valueOf(amount, s.to);
    out.push({ label: s.label, currency: s.to, amount, value, stepDiff: value - prevValue, totalDiff: value - start.amount });
    prevValue = value;
  }
  return out;
}
