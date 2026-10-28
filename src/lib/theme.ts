import type { Settings } from './types';

export const ACCENTS: [string, string][] = [
  ['Azul', '#0a84ff'],
  ['Índigo', '#5e5ce6'],
  ['Morado', '#bf5af2'],
  ['Rosa', '#ff375f'],
  ['Rojo', '#ff453a'],
  ['Naranja', '#ff9f0a'],
  ['Amarillo', '#ffd60a'],
  ['Verde', '#30d158'],
  ['Menta', '#00c7be'],
  ['Cian', '#32ade6'],
  ['Grafito', '#8e8e93'],
];

/** Texto blanco o negro según el contraste con el color principal (WCAG). */
export function onColor(hex: string): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#ffffff';
  const lin = (v: string) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  // Como en iOS: texto blanco salvo en colores claros (amarillo, verde lima…), donde no se leería.
  return 1.05 / (L + 0.05) >= 3 ? '#ffffff' : '#000000';
}

/** Aplica el color principal y el tema claro/oscuro/automático a toda la app. */
export function applyTheme(theme: Settings['theme']) {
  const accent = theme?.accent ?? '#0a84ff';
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--on-accent', onColor(accent));
  if (!theme || theme.mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.mode);
  const dark = theme?.mode === 'dark' || (theme?.mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
  try {
    localStorage.setItem('finanzas.theme', JSON.stringify({ accent, mode: theme?.mode ?? 'auto' }));
  } catch {
    /* sin almacenamiento */
  }
}

/** Antes de desbloquear, usa el último tema guardado (no es un dato sensible). */
export function applySavedTheme() {
  try {
    const t = localStorage.getItem('finanzas.theme');
    if (t) applyTheme(JSON.parse(t));
  } catch {
    /* sin almacenamiento */
  }
}
