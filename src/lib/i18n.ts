import { EN } from './en';

// Idiomas: español (por defecto) e inglés. La clave de cada texto es el propio texto en español, de modo
// que lo que aún no tiene traducción se ve en español en lugar de romperse. El idioma se guarda en este
// dispositivo y, si no se ha elegido, sigue al del navegador. Al cambiarlo la app se recarga.
export type Lang = 'es' | 'en';
const KEY = 'finanzas.lang';

function detect(): Lang {
  // Las pruebas automáticas se ejecutan siempre en español.
  if (import.meta.env?.MODE === 'test') return 'es';
  try {
    // Enlaces desde la web (…/app/?lang=en) fijan el idioma.
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'es' || q === 'en') {
      localStorage.setItem(KEY, q);
      return q;
    }
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* sin almacenamiento */
  }
  return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language) ? 'en' : 'es';
}

export const LANG: Lang = detect();
export const LOCALE = LANG === 'en' ? 'en-US' : 'es-ES';

/** Texto en el idioma activo. Admite variables: t('Hola {name}', { name }). */
export function t(text: string, vars?: Record<string, string | number>): string {
  const out = LANG === 'en' ? (EN[text] ?? text) : text;
  return vars ? out.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : out;
}

export function setLang(lang: Lang | 'auto'): void {
  try {
    if (lang === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, lang);
  } catch {
    /* ignorado */
  }
  location.reload();
}

export const savedLang = (): Lang | 'auto' => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'es' || v === 'en' ? v : 'auto';
  } catch {
    return 'auto';
  }
};
