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
