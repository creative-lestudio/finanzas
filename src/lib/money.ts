export const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

const fmtCache = new Map<string, Intl.NumberFormat>();

let defaultCurrency = 'EUR';
let masked = false;

/** Modo privado ("ojito"): todos los importes se muestran como ••••. */
export function setMasked(on: boolean) {
  masked = on;
}
export const isMasked = () => masked;

/** Moneda que usa formatMoney cuando no se indica otra (la principal del usuario). */
export function setDefaultCurrency(code: string) {
  defaultCurrency = code;
}

export function formatMoney(cents: number, currency = defaultCurrency): string {
  let f = fmtCache.get(currency);
  if (!f) {
    try {
      // El dólar se muestra como "$" (no "US$"), como se escribe a diario.
      f = new Intl.NumberFormat('es-ES', { style: 'currency', currency, ...(currency === 'USD' ? { currencyDisplay: 'narrowSymbol' as const } : {}) });
    } catch {
      // Monedas no ISO (USDT, USDC...): número + código.
      const n = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      f = { format: (v: number) => `${n.format(v)} ${currency}` } as Intl.NumberFormat;
    }
    fmtCache.set(currency, f);
  }
  const text = f.format(cents / 100);
  // Se ocultan las cifras pero se mantiene el símbolo, para saber de qué moneda se habla.
  return masked ? text.replace(/\d(?:[\d.,\s\u00a0\u202f]*\d)?/g, '••••') : text;
}

/** Formatea una tasa con decimales razonables (40,5 / 0,9213). */
export function formatRate(rate: number): string {
  const digits = rate >= 100 ? 2 : rate >= 1 ? 4 : 6;
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(rate);
}

/** Convierte "12,50", "-1.234,56", "12.5" o "1,234.56" a céntimos. */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/[€\s]/g, '');
  if (!s) return null;
  // "1.500" en un importe es mil quinientos: un importe nunca lleva tres decimales.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export const today = (): string => new Date().toISOString().slice(0, 10);

export const monthKey = (date: string): string => date.slice(0, 7);

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Normaliza texto: minúsculas, sin acentos, espacios simples. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae un nombre de comercio estable de la descripción bancaria,
 * quitando prefijos de canal, fechas, números de tarjeta y referencias.
 */
export function merchantKey(description: string): string {
  return normalize(description)
    .replace(/^(compra( en)?|pago( en)?|cargo|recibo|adeudo|transferencia( a| de)?|bizum (a|de|enviado a|recibido de)?|tarj(eta)?\.?|tpv)\s+/g, '')
    .replace(/\b(compra|pago|tarjeta|tarj|card|visa|mastercard)\b/g, ' ')
    .replace(/\d{2}[/.-]\d{2}([/.-]\d{2,4})?/g, ' ')
    .replace(/\*+\d+|\b\d{4,}\b|#\S+|ref\S*/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

/**
 * Concepto legible para mostrar: los bancos escriben "COMPRA MERCADONA 2342
 * MADRID"; se muestra "Mercadona 2342 Madrid". No cambia el dato guardado.
 */
export function prettyDescription(text: string): string {
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  const shouting = letters.length > 3 && letters === letters.toUpperCase();
  let t = text.trim();
  if (shouting) {
    t = t.replace(/^(COMPRA( EN)?|PAGO( EN)?|RECIBO|ADEUDO|CARGO)\s+/i, '');
    t = t.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase());
  }
  return t;
}

/** "octubre de 2026" → "Octubre de 2026". */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
