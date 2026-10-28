import { addMonths, daysInMonth } from './money';
import { monthSummary } from './insights';
import type { AppData, Budget } from './types';

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budget: Budget;
  /** Tope efectivo del mes (incluye lo arrastrado si hay rollover). */
  limit: number;
  spent: number;
  remaining: number;
  ratio: number;
  state: BudgetState;
  /** Proyección de gasto a final de mes al ritmo actual. */
  projected: number;
  /** Cuánto se puede gastar por día lo que queda de mes. */
  dailyAllowance: number;
}

export function budgetStatus(data: AppData, month: string, asOfDay: number): BudgetStatus[] {
  const summary = monthSummary(data, month);
  const prev = data.budgets.some((b) => b.rollover) ? monthSummary(data, addMonths(month, -1)) : null;
  const dim = daysInMonth(month);
  const day = Math.min(Math.max(asOfDay, 1), dim);

  return data.budgets.map((budget) => {
    const spent = Math.max(0, summary.byCategory[budget.categoryId] ?? 0);
    const carry = budget.rollover && prev ? Math.max(0, budget.limit - (prev.byCategory[budget.categoryId] ?? 0)) : 0;
    const limit = budget.limit + carry;
    const ratio = limit > 0 ? spent / limit : spent > 0 ? Infinity : 0;
    const state: BudgetState = ratio > 1 ? 'over' : ratio >= budget.warnAt ? 'warning' : 'ok';
    const daysLeft = dim - day + 1;
    return {
      budget,
      limit,
      spent,
      remaining: limit - spent,
      ratio,
      state,
      projected: Math.round((spent / day) * dim),
      dailyAllowance: Math.max(0, Math.floor((limit - spent) / daysLeft)),
    };
  });
}

/** Comprueba si un nuevo gasto haría cruzar un umbral, para avisar al instante. */
export function budgetAlertFor(
  data: AppData,
  categoryId: string,
  month: string,
  asOfDay: number,
): BudgetStatus | undefined {
  const s = budgetStatus(data, month, asOfDay).find((b) => b.budget.categoryId === categoryId);
  return s && s.state !== 'ok' ? s : undefined;
}

/** Propone topes a partir de la media de los últimos 3 meses, redondeada a 10 €. */
export function suggestBudgets(data: AppData, month: string): { categoryId: string; limit: number }[] {
  const months = [1, 2, 3].map((i) => monthSummary(data, addMonths(month, -i)));
  const totals: Record<string, number> = {};
  for (const m of months) for (const [c, v] of Object.entries(m.byCategory)) totals[c] = (totals[c] ?? 0) + v;
  return Object.entries(totals)
    .map(([categoryId, total]) => ({ categoryId, limit: Math.ceil(total / 3 / 1000) * 1000 }))
    .filter((s) => s.limit >= 2000 && !data.budgets.some((b) => b.categoryId === s.categoryId))
    .sort((a, b) => b.limit - a.limit);
}
