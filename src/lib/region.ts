import type { AppData } from './types';

// La app sirve igual en España, Venezuela, EE. UU. y el resto del mundo. La región decide los valores por
// defecto (moneda, tipos de cuenta, qué herramientas se muestran) sin cerrar nada: se puede cambiar en Ajustes.
export type Region = 'ES' | 'EU' | 'US' | 'VE' | 'LATAM' | 'OTHER';

export const REGIONS: Region[] = ['ES', 'EU', 'US', 'VE', 'LATAM', 'OTHER'];

export const REGION_LABEL: Record<Region, string> = {
  ES: 'España',
  EU: 'Europa (euro)',
  US: 'Estados Unidos',
  VE: 'Venezuela',
  LATAM: 'Latinoamérica',
  OTHER: 'Otro país',
};

const EU = new Set(['DE', 'FR', 'IT', 'PT', 'NL', 'BE', 'IE', 'AT', 'FI', 'GR', 'LU', 'SK', 'SI', 'EE', 'LV', 'LT', 'MT', 'CY', 'HR']);
const LATAM = new Set(['MX', 'AR', 'CO', 'CL', 'PE', 'EC', 'UY', 'PY', 'BO', 'DO', 'PA', 'CR', 'GT', 'HN', 'NI', 'SV', 'CU', 'PR', 'BR']);

const COUNTRY_CURRENCY: Record<string, string> = {
  US: 'USD', ES: 'EUR', VE: 'USD', MX: 'MXN', AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN', BR: 'BRL', GB: 'GBP', CA: 'CAD', CH: 'CHF', DO: 'DOP', PA: 'USD', EC: 'USD', SV: 'USD',
};

/** País a partir del idioma del navegador («es-VE») o, si no lo trae, de la zona horaria. */
export function detectCountry(lang = typeof navigator !== 'undefined' ? navigator.language : '', tz = ''): string {
  const m = lang.match(/[-_]([A-Za-z]{2})\b/);
  if (m) return m[1].toUpperCase();
  try {
    const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/Caracas/.test(zone)) return 'VE';
    if (/Madrid|Canary/.test(zone)) return 'ES';
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit)/.test(zone)) return 'US';
    if (/Mexico/.test(zone)) return 'MX';
  } catch {
    /* sin Intl */
  }
  return /^en\b/i.test(lang) ? 'US' : /^es\b/i.test(lang) ? 'ES' : '';
}

export function regionFromCountry(c: string): Region {
  if (c === 'ES') return 'ES';
  if (c === 'US') return 'US';
  if (c === 'VE') return 'VE';
  if (EU.has(c)) return 'EU';
  if (LATAM.has(c)) return 'LATAM';
  return 'OTHER';
}

export const detectRegion = (): Region => regionFromCountry(detectCountry());

/** Moneda principal sugerida según el país. */
export const defaultCurrency = (country = detectCountry()): string => COUNTRY_CURRENCY[country] ?? (EU.has(country) ? 'EUR' : 'USD');

export const regionOf = (d: Pick<AppData, 'settings'>): Region => d.settings.region ?? detectRegion();

/** ¿Tiene sentido mostrar las herramientas de Venezuela (BCV, paralelo, brecha)? */
export const isVenezuelan = (d: Pick<AppData, 'settings' | 'accounts'>): boolean =>
  regionOf(d) === 'VE' || d.settings.currency === 'VES' || d.accounts.some((a) => a.currency === 'VES');

/** Bizum solo existe en España. */
export const hasBizum = (d: Pick<AppData, 'settings'>): boolean => regionOf(d) === 'ES';

/** La conexión bancaria PSD2 (Open Banking) es europea. */
export const hasOpenBanking = (d: Pick<AppData, 'settings'>): boolean => ['ES', 'EU'].includes(regionOf(d));
