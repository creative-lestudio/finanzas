import { DEFAULT_CATEGORIES } from './defaults';
import { FAMILIES } from './families';
import type { AppData, Category } from './types';

const FAMILY_ICON: Record<string, string> = { comida: 'fork', hogar: 'home', transporte: 'bus', compras: 'bag', ocio: 'ticket', salud: 'pulse' };

/**
 * Estructura sugerida: agrupa las categorías de serie en madres por tipo de gasto
 * (Comida › Supermercado, Restaurantes, Cafés…). Solo agrupa las que aún no tienen madre
 * y no toca nada de lo que ya hayas organizado tú.
 */
export function applySuggestedStructure(d: AppData): AppData {
  const ids = new Set(d.categories.map((c) => c.id));
  const move = new Map<string, string>();
  const parents: Category[] = [];
  for (const f of FAMILIES) {
    const kids = f.categories.filter((id) => d.categories.some((c) => c.id === id && !c.parentId && DEFAULT_CATEGORIES.some((x) => x.id === id)));
    if (kids.length < 2 || !FAMILY_ICON[f.id]) continue;
    const pid = `fam_${f.id}`;
    if (!ids.has(pid)) parents.push({ id: pid, name: f.label, icon: `ic:${FAMILY_ICON[f.id]}`, kind: 'expense', family: f.id });
    for (const k of kids) move.set(k, pid);
  }
  if (!move.size) return d;
  return { ...d, categories: [...d.categories.map((c) => (move.has(c.id) ? { ...c, parentId: move.get(c.id) } : c)), ...parents] };
}
