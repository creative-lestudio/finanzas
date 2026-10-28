// Grupos de categorías con color propio. El orden es fijo (el color sigue al
// grupo, nunca a su posición en un ranking) y la paleta está validada para
// daltonismo en este orden de vecinos. Verde y rojo quedan reservados para
// ingresos/positivo y gastos/negativo.

export interface Family {
  id: string;
  label: string;
  /** Variable CSS con el color del grupo (definida en styles.css para claro y oscuro). */
  color: string;
  categories: string[];
}

export const FAMILIES: Family[] = [
  { id: 'comida', label: 'Comida', color: 'var(--fam-comida)', categories: ['groceries', 'restaurants', 'coffee'] },
  { id: 'hogar', label: 'Hogar', color: 'var(--fam-hogar)', categories: ['home', 'utilities', 'telecom'] },
  { id: 'transporte', label: 'Transporte y viajes', color: 'var(--fam-transporte)', categories: ['transport', 'fuel', 'travel'] },
  { id: 'compras', label: 'Compras', color: 'var(--fam-compras)', categories: ['shopping'] },
  { id: 'ocio', label: 'Ocio y suscripciones', color: 'var(--fam-ocio)', categories: ['subscriptions', 'leisure', 'education'] },
  { id: 'salud', label: 'Salud y deporte', color: 'var(--fam-salud)', categories: ['health', 'sport'] },
  { id: 'otros', label: 'Otros', color: 'var(--fam-otros)', categories: [] },
];

const INCOME = new Set(['salary', 'bizum_in', 'other_income', 'freelance', 'remittance']);
const NEUTRAL = new Set(['transfer', 'exchange']);

export function familyOf(categoryId: string): Family {
  return FAMILIES.find((f) => f.categories.includes(categoryId)) ?? FAMILIES[FAMILIES.length - 1];
}

/** Color de una categoría: verde los ingresos, neutro los traspasos y el de su grupo el resto. */
export function categoryColor(categoryId: string): string {
  if (INCOME.has(categoryId)) return 'var(--good)';
  if (NEUTRAL.has(categoryId)) return 'var(--fam-otros)';
  return familyOf(categoryId).color;
}

/** Gasto del mes agrupado por familia, en el orden fijo de la paleta. */
export function spendByFamily(byCategory: Record<string, number>): { family: Family; value: number }[] {
  const totals = new Map<string, number>();
  for (const [cat, v] of Object.entries(byCategory)) {
    if (v <= 0 || INCOME.has(cat) || NEUTRAL.has(cat)) continue;
    const f = familyOf(cat);
    totals.set(f.id, (totals.get(f.id) ?? 0) + v);
  }
  return FAMILIES.map((family) => ({ family, value: totals.get(family.id) ?? 0 })).filter((x) => x.value > 0);
}
