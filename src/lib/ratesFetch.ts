import { addRate } from './fx';
import { today } from './money';
import type { AppData } from './types';

// Descarga de tasas públicas (opcional; desactivado en modo sin terceros).
//  - Bolívar: ve.dolarapi.com (oficial BCV y paralelo).
//  - Resto: open.er-api.com (tipo medio de mercado, base USD).
// Si un servicio falla, se ignora y se pueden introducir las tasas a mano.

interface DolarApiItem {
  fuente?: string;
  nombre?: string;
  promedio?: number | null;
  venta?: number | null;
  fechaActualizacion?: string;
}

export async function fetchRates(data: AppData, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<{ data: AppData; added: string[]; failed: string[] }> {
  if (data.settings.offlineOnly) throw new Error('El modo sin terceros está activado.');
  const date = today();
  const added: string[] = [];
  const failed: string[] = [];
  let next = data;
  const currencies = new Set(data.accounts.map((a) => a.currency).concat(data.settings.currency));

  if (currencies.has('VES')) {
    try {
      const res = await fetchImpl('https://ve.dolarapi.com/v1/dolares');
      const items = (await res.json()) as DolarApiItem[];
      for (const it of items) {
        const rate = it.promedio ?? it.venta;
        if (!rate) continue;
        const f = (it.fuente ?? it.nombre ?? '').toLowerCase();
        const source = f.includes('oficial') ? 'BCV' : f.includes('paralelo') ? 'Paralelo' : null;
        if (!source) continue;
        next = addRate(next, { date, base: 'USD', quote: 'VES', rate, source });
        added.push(`USD/VES ${source}`);
      }
    } catch {
      failed.push('Bolívar (dolarapi)');
    }
  }

  const others = [...currencies].filter((c) => !['USD', 'VES', 'USDT', 'USDC'].includes(c));
  if (others.length || currencies.has('USD')) {
    try {
      const res = await fetchImpl('https://open.er-api.com/v6/latest/USD');
      const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
      if (body.result !== 'success' || !body.rates) throw new Error();
      for (const c of others) {
        const r = body.rates[c];
        if (!r) continue;
        // Para el euro y la libra se guarda "1 EUR = x USD", como se suele leer.
        if (c === 'EUR' || c === 'GBP') next = addRate(next, { date, base: c, quote: 'USD', rate: Math.round((1 / r) * 1e6) / 1e6, source: 'Mercado medio' });
        else next = addRate(next, { date, base: 'USD', quote: c, rate: r, source: 'Mercado medio' });
        added.push(`${c} medio`);
      }
    } catch {
      failed.push('Tipo medio (er-api)');
    }
  }
  return { data: next, added, failed };
}
