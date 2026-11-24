import { addRate } from './fx';
import type { AppData } from './types';

// Tasas oficiales del día (BCV dólar y euro) y paralelo, desde DolarApi (datos del BCV).
// Solo se descargan tasas públicas; nada de tus datos sale del dispositivo.
const BASE = 'https://ve.dolarapi.com/v1';

export interface LiveRates {
  date: string;
  BCV?: number;
  Euro?: number;
  Paralelo?: number;
}

async function get(path: string): Promise<{ promedio?: number | null; venta?: number | null; fechaActualizacion?: string } | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(`${BASE}${path}`, { signal: ctl.signal });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const val = (j: Awaited<ReturnType<typeof get>>) => {
  const n = Number(j?.promedio ?? j?.venta);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export async function fetchLiveRates(today: string): Promise<LiveRates | null> {
  const [usd, eur, par] = await Promise.all([get('/dolares/oficial'), get('/euros/oficial'), get('/dolares/paralelo')]);
  const out: LiveRates = { date: today, BCV: val(usd), Euro: val(eur), Paralelo: val(par) };
  return out.BCV || out.Euro || out.Paralelo ? out : null;
}

/** Guarda las tasas de hoy sin pisar las que ya escribiste tú para ese día. Devuelve null si no hay nada nuevo. */
export function applyLiveRates(data: AppData, live: LiveRates, force = false): AppData | null {
  let next = data;
  let changed = false;
  const add = (source: 'BCV' | 'Euro' | 'Paralelo', base: string, rate?: number) => {
    if (!rate) return;
    if (!force && next.rates.some((r) => r.date === live.date && r.source === source)) return;
    next = addRate(next, { date: live.date, base, quote: 'VES', rate, source });
    changed = true;
  };
  add('BCV', 'USD', live.BCV);
  add('Euro', 'EUR', live.Euro);
  add('Paralelo', 'USD', live.Paralelo);
  return changed ? next : null;
}

// ---------- Tasas de mercado para cualquier moneda (EUR, GBP, MXN, COP, CAD…) ----------
// Sirve a quien tiene cuentas en varias monedas y no es venezolano: sin tasa, los totales no se pueden sumar.
// Fuente pública (open.er-api.com). No se envía ningún dato tuyo; con «Modo sin terceros» no se usa.
const MARKET_URL = 'https://open.er-api.com/v6/latest/USD';
const PEGGED = new Set(['USD', 'USDT', 'USDC', 'PAB']);

export async function fetchMarketRates(): Promise<Record<string, number> | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(MARKET_URL, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: string; rates?: Record<string, number> };
    return j.result === 'success' && j.rates ? j.rates : null;
  } catch {
    return null;
  }
}

/** Monedas de la app que necesitan una tasa de mercado (sin las de Venezuela ni las pegadas al dólar). */
export const marketCurrencies = (data: AppData): string[] =>
  [...new Set([data.settings.currency, ...data.accounts.map((a) => a.currency), ...(data.debts ?? []).map((d) => d.currency)])].filter((c) => !PEGGED.has(c) && c !== 'VES');

/** ¿Hay al menos dos monedas (que no sean de Venezuela) cuyo cambio necesite una tasa? */
export const needsMarketRates = (data: AppData): boolean =>
  new Set([data.settings.currency, ...data.accounts.map((a) => a.currency), ...(data.debts ?? []).map((d) => d.currency)].filter((c) => c !== 'VES').map((c) => (PEGGED.has(c) ? 'USD' : c))).size > 1;

/** Guarda 1 USD = x moneda para hoy, sin pisar ninguna tasa que ya haya ese día (la tuya manda). */
export function applyMarketRates(data: AppData, rates: Record<string, number>, date: string): AppData | null {
  let next = data;
  let changed = false;
  for (const code of marketCurrencies(data)) {
    const rate = rates[code];
    if (!rate || rate <= 0) continue;
    const has = next.rates.some((r) => r.date === date && ((r.base === 'USD' && r.quote === code) || (r.base === code && r.quote === 'USD')));
    if (has) continue;
    next = addRate(next, { date, base: 'USD', quote: code, rate, source: 'Personalizada' });
    changed = true;
  }
  return changed ? next : null;
}
