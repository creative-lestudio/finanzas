import type { Category } from './types';

// Jerarquía de categorías: una categoría puede tener una madre (un solo nivel de subcategorías).
// Los movimientos se guardan con la categoría más específica; los informes y presupuestos pueden
// agrupar por la madre.

let byId = new Map<string, Category>();

/** Registro global (lo actualiza la app al cargar datos) para resolver color e icono por id. */
export function registerCategories(list: Category[]): void {
  byId = new Map(list.map((c) => [c.id, c]));
}

export const getCategory = (id: string): Category | undefined => byId.get(id);

/** Id de la categoría madre (o la propia si no tiene madre). */
export function rootOf(id: string): string {
  const c = byId.get(id);
  return c?.parentId && byId.has(c.parentId) ? c.parentId : id;
}

/** Subcategorías de una categoría. */
export const childrenOf = (list: Category[], id: string): Category[] => list.filter((c) => c.parentId === id);

/** La categoría y sus subcategorías (para filtros y presupuestos de la madre). */
export const idsUnder = (list: Category[], id: string): string[] => [id, ...childrenOf(list, id).map((c) => c.id)];

/** Categorías madre (sin madre) de un tipo. */
export const rootsOf = (list: Category[], kind: Category['kind']): Category[] => list.filter((c) => c.kind === kind && !(c.parentId && list.some((p) => p.id === c.parentId)));

/** ¿Puede `id` pasar a ser subcategoría de `parentId`? (sin ciclos, un solo nivel, mismo tipo) */
export function canMoveUnder(list: Category[], id: string, parentId: string): boolean {
  if (id === parentId) return false;
  const c = list.find((x) => x.id === id);
  const p = list.find((x) => x.id === parentId);
  if (!c || !p || c.kind !== p.kind) return false;
  if (p.parentId) return false; // la madre no puede ser a su vez subcategoría
  if (childrenOf(list, id).length) return false; // una categoría con hijas no puede colgar de otra
  return true;
}

/** Suma de gastos por categoría madre (las subcategorías se agrupan en su madre). */
export function groupByRoot(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(values)) {
    const r = rootOf(id);
    out[r] = (out[r] ?? 0) + v;
  }
  return out;
}

/** Nombre completo: «Madre › Sub» para subcategorías. */
export function categoryLabel(list: Category[], id: string): string {
  const c = list.find((x) => x.id === id);
  if (!c) return id;
  const p = c.parentId ? list.find((x) => x.id === c.parentId) : undefined;
  return p ? `${p.name} › ${c.name}` : c.name;
}
