/** Datos con los que se abre «Nuevo movimiento» desde un atajo (Apple Pay, Back Tap, widget, enlace). */
export interface Prefill {
  amount?: string;
  merchant?: string;
  kind?: 'expense' | 'income';
  currency?: string;
  account?: string;
  date?: string;
  /** Abrir pensado para escanear un recibo. */
  scan?: boolean;
}

const first = (p: URLSearchParams, ...names: string[]) => {
  for (const n of names) {
    const v = p.get(n);
    if (v && v.trim()) return v.trim();
  }
  return undefined;
};

/**
 * Lee los parámetros del enlace: ?accion=nuevo&monto=25,50&comercio=Mercadona&moneda=EUR&cuenta=BBVA&tipo=gasto&fecha=2026-11-03
 * El importe puede traer símbolo o texto («$25.50», «25,50 €»): solo se conservan cifras y separadores.
 */
export function prefillFromUrl(search: string): Prefill | null {
  const p = new URLSearchParams(search);
  const a = p.get('accion');
  if (a !== 'nuevo' && a !== 'escanear') return null;
  const out: Prefill = {};
  const amount = first(p, 'monto', 'importe', 'amount')?.replace(/[^\d.,]/g, '');
  if (amount) out.amount = amount;
  const merchant = first(p, 'comercio', 'concepto', 'merchant', 'desc');
  if (merchant) out.merchant = merchant.slice(0, 80);
  const tipo = first(p, 'tipo', 'kind')?.toLowerCase();
  if (tipo) out.kind = /ingres|income|cobro/.test(tipo) ? 'income' : 'expense';
  const cur = first(p, 'moneda', 'currency')?.toUpperCase();
  if (cur && /^[A-Z]{3,5}$/.test(cur)) out.currency = cur;
  const acc = first(p, 'cuenta', 'account');
  if (acc) out.account = acc.slice(0, 60);
  const date = first(p, 'fecha', 'date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.date = date;
  if (a === 'escanear') out.scan = true;
  return out;
}
