import { groupByRoot, rootOf } from './categories';
import { txBase } from './fx';
import { addMonths, monthKey, today } from './money';
import type { AppData } from './types';

export type RangeKey = '1' | '3' | '12' | 'all';

export interface MonthTotals {
  month: string;
  income: number;
  expenses: number;
}

export interface Report {
  months: string[];
  perMonth: MonthTotals[];
  income: number;
  expenses: number;
  net: number;
  /** Gasto por categoría madre (moneda principal). */
  expenseByRoot: Record<string, number>;
  /** Gasto por subcategoría/categoría (moneda principal). */
  expenseByCategory: Record<string, number>;
  incomeByRoot: Record<string, number>;
  /** Monedas sin tasa conocida (no se pudieron sumar). */
  missingRates: Set<string>;
}

/** Meses del rango, del más antiguo al actual. */
export function monthsFor(data: Pick<AppData, 'transactions'>, range: RangeKey, now = today()): string[] {
  const current = monthKey(now);
  if (range === 'all') {
    const first = data.transactions.reduce((m, t) => (t.date < m ? t.date : m), now);
    const out: string[] = [];
    for (let m = monthKey(first); m <= current; m = addMonths(m, 1)) out.push(m);
    return out.length ? out : [current];
  }
  const n = Number(range);
  return Array.from({ length: n }, (_, i) => addMonths(current, i - (n - 1)));
}

/** Ingresos y gastos totales y por mes, y su reparto por categoría, siempre en la moneda principal. */
export function buildReport(data: AppData, months: string[]): Report {
  const set = new Set(months);
  const kinds = new Map(data.categories.map((c) => [c.id, c.kind]));
  const perMonth = new Map<string, MonthTotals>(months.map((m) => [m, { month: m, income: 0, expenses: 0 }]));
  const missing = new Set<string>();
  const expCat: Record<string, number> = {};
  const incCat: Record<string, number> = {};
  for (const t of data.transactions) {
    const m = monthKey(t.date);
    if (!set.has(m)) continue;
    const kind = kinds.get(t.categoryId);
    if (kind === 'transfer' || t.exchangeId) continue;
    const v = txBase(data, t, missing);
    const row = perMonth.get(m)!;
    if (t.amount >= 0 && kind !== 'expense') {
      row.income += v;
      incCat[t.categoryId] = (incCat[t.categoryId] ?? 0) + v;
    } else {
      row.expenses -= v;
      expCat[t.categoryId] = (expCat[t.categoryId] ?? 0) - v;
    }
  }
  const rows = months.map((m) => perMonth.get(m)!);
  const income = rows.reduce((s, r) => s + r.income, 0);
  const expenses = rows.reduce((s, r) => s + r.expenses, 0);
  return { months, perMonth: rows, income, expenses, net: income - expenses, expenseByRoot: groupByRoot(expCat), expenseByCategory: expCat, incomeByRoot: groupByRoot(incCat), missingRates: missing };
}

/** Reparto ordenado de mayor a menor, con porcentaje. */
export function ranking(by: Record<string, number>): { id: string; value: number; pct: number }[] {
  const entries = Object.entries(by).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return entries.map(([id, value]) => ({ id, value, pct: total ? value / total : 0 })).sort((a, b) => b.value - a.value);
}

export { rootOf };
