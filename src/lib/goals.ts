import { convert } from './fx';
import { addMonths, monthKey, today } from './money';
import type { AppData, Goal } from './types';

// Metas medibles (SMART): cada meta tiene cifra, fecha, plan mensual y una
// forma objetiva de medir el avance (aportaciones o saldo de cuentas).

export type GoalStatus = 'done' | 'ahead' | 'on_track' | 'behind' | 'no_plan';

export interface GoalProgress {
  goal: Goal;
  currency: string;
  /** Valor actual (céntimos). Para deudas: lo que queda por pagar. */
  current: number;
  /** 0-1 */
  ratio: number;
  remaining: number;
  monthsLeft: number | null;
  /** Aportación mensual necesaria para llegar a tiempo. */
  requiredMonthly: number | null;
  /** Aportación media real de los últimos 3 meses. */
  actualMonthly: number;
  /** Fecha estimada de logro al ritmo actual (o al plan). */
  projectedDate: string | null;
  /** Para inversión: valor proyectado a la fecha límite con rentabilidad compuesta. */
  projectedAtDeadline: number | null;
  status: GoalStatus;
  /** Avance esperado a hoy si fuera en línea recta desde el inicio. */
  expectedRatio: number | null;
}

const monthsBetween = (fromMonth: string, toMonth: string) => {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
};

/** Valor actual de la meta: saldo de las cuentas vinculadas o lo apartado en la hucha. */
export function goalCurrent(data: AppData, goal: Goal): number {
  const currency = goal.currency ?? data.settings.currency;
  if (!goal.accountIds?.length) return goal.saved;
  const sum = goal.accountIds.reduce((s, id) => {
    const a = data.accounts.find((x) => x.id === id);
    if (!a) return s;
    return s + (convert(data, a.balance, a.currency, currency, today()) ?? 0);
  }, 0);
  // En deudas los saldos son negativos: el valor es lo pagado = inicial − pendiente.
  if (goal.kind === 'debt') return Math.max(0, (goal.startAmount ?? goal.target) - Math.abs(sum));
  return sum;
}

/** Valor futuro con aportaciones mensuales y rentabilidad anual compuesta mensualmente. */
export function futureValue(present: number, monthly: number, annualPct: number, months: number): number {
  const r = annualPct / 100 / 12;
  if (!r) return Math.round(present + monthly * months);
  const g = (1 + r) ** months;
  return Math.round(present * g + monthly * ((g - 1) / r));
}

/** Meses hasta alcanzar el objetivo con aportación y rentabilidad dadas (máx. 100 años). */
export function monthsToTarget(present: number, monthly: number, annualPct: number, target: number): number | null {
  if (present >= target) return 0;
  if (monthly <= 0 && annualPct <= 0) return null;
  for (let m = 1; m <= 1200; m++) if (futureValue(present, monthly, annualPct, m) >= target) return m;
  return null;
}

export function goalProgress(data: AppData, goal: Goal, asOf = today()): GoalProgress {
  const currency = goal.currency ?? data.settings.currency;
  const current = goalCurrent(data, goal);
  const ratio = goal.target > 0 ? Math.min(1, current / goal.target) : 0;
  const remaining = Math.max(0, goal.target - current);
  const month = monthKey(asOf);
  const monthsLeft = goal.deadline ? Math.max(0, monthsBetween(month, monthKey(goal.deadline)) + 1) : null;
  const ret = goal.kind === 'investment' ? goal.expectedReturn ?? 0 : 0;

  // Aportaciones reales: movimientos de la hucha de los últimos 3 meses.
  const from = addMonths(month, -3);
  const contributed = data.goalMovements
    .filter((m) => m.goalId === goal.id && monthKey(m.date) >= from && monthKey(m.date) < month)
    .reduce((s, m) => s + m.amount, 0);
  const actualMonthly = Math.round(contributed / 3);

  let requiredMonthly: number | null = null;
  if (monthsLeft !== null) {
    if (remaining === 0) requiredMonthly = 0;
    else if (monthsLeft === 0) requiredMonthly = remaining;
    else if (ret) {
      // Despeja la aportación de la fórmula de valor futuro.
      const r = ret / 100 / 12;
      const g = (1 + r) ** monthsLeft;
      requiredMonthly = Math.max(0, Math.ceil((goal.target - current * g) / ((g - 1) / r)));
    } else requiredMonthly = Math.ceil(remaining / monthsLeft);
  }

  const pace = actualMonthly > 0 ? actualMonthly : goal.monthlyPlan ?? 0;
  const m = monthsToTarget(current, pace, ret, goal.target);
  const projectedDate = m === null ? null : `${addMonths(month, m)}-01`;
  const projectedAtDeadline = monthsLeft !== null ? futureValue(current, pace, ret, monthsLeft) : null;

  let expectedRatio: number | null = null;
  if (goal.deadline && goal.startDate) {
    const total = Math.max(1, monthsBetween(monthKey(goal.startDate), monthKey(goal.deadline)));
    const done = Math.min(total, Math.max(0, monthsBetween(monthKey(goal.startDate), month)));
    const start = goal.startAmount ?? 0;
    expectedRatio = (start + ((goal.target - start) * done) / total) / goal.target;
  }

  let status: GoalStatus;
  if (current >= goal.target) status = 'done';
  else if (!goal.deadline) status = pace > 0 ? 'on_track' : 'no_plan';
  else if (projectedAtDeadline !== null && projectedAtDeadline >= goal.target * 1.05 && pace > 0) status = 'ahead';
  else if (projectedAtDeadline !== null && projectedAtDeadline >= goal.target) status = 'on_track';
  else status = pace > 0 || current > 0 ? 'behind' : 'no_plan';

  return { goal, currency, current, ratio, remaining, monthsLeft, requiredMonthly, actualMonthly, projectedDate, projectedAtDeadline, status, expectedRatio };
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  done: 'Conseguida',
  ahead: 'Por delante',
  on_track: 'En camino',
  behind: 'Retrasada',
  no_plan: 'Sin plan',
};

export const GOAL_KIND_LABEL: Record<NonNullable<Goal['kind']>, string> = {
  savings: 'Ahorro',
  investment: 'Inversión',
  debt: 'Pagar deuda',
  purchase: 'Compra',
};
