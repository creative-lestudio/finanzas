import { addMonths, monthKey, uid } from './money';
import { monthSummary } from './insights';
import type { AppData, Goal, GoalMovement } from './types';

/** Redondeo de una compra: lo que falta hasta el siguiente múltiplo. */
export function roundUpAmount(amount: number, to = 100): number {
  if (amount >= 0) return 0;
  const spent = -amount;
  const rem = spent % to;
  return rem === 0 ? 0 : to - rem;
}

export interface SavingProposal {
  goalId: string;
  amount: number;
  reason: GoalMovement['reason'];
  detail: string;
}

/**
 * "Ahorro inteligente" estilo Plum: calcula cuánto se puede apartar este mes
 * sin riesgo, a partir de ingresos y gasto medio de los últimos 3 meses,
 * dejando siempre un colchón del 10 % de los ingresos.
 */
export function safeToSave(data: AppData, month: string): number {
  const hist = [1, 2, 3].map((i) => monthSummary(data, addMonths(month, -i))).filter((m) => m.income > 0);
  if (!hist.length) return 0;
  const income = hist.reduce((s, m) => s + m.income, 0) / hist.length;
  const expenses = hist.reduce((s, m) => s + m.expenses, 0) / hist.length;
  const surplus = income - expenses - income * 0.1;
  // Se propone apartar la mitad del excedente medio, redondeado a 5 €.
  return Math.max(0, Math.floor(surplus / 2 / 500) * 500);
}

/** Reparte una cantidad entre huchas por prioridad, sin pasarse del objetivo. */
export function distribute(goals: Goal[], amount: number): { goalId: string; amount: number }[] {
  const open = goals.filter((g) => g.saved < g.target).sort((a, b) => a.priority - b.priority);
  const out: { goalId: string; amount: number }[] = [];
  let left = amount;
  for (const g of open) {
    if (left <= 0) break;
    const take = Math.min(left, g.target - g.saved);
    out.push({ goalId: g.id, amount: take });
    left -= take;
  }
  return out;
}

/** Genera propuestas de ahorro automático del mes, para que el usuario las confirme. */
export function savingProposals(data: AppData, month: string): SavingProposal[] {
  const r = data.savingsRules;
  if (!r.enabled || !data.goals.length) return [];
  const already = new Set(
    data.goalMovements.filter((m) => monthKey(m.date) === month && m.reason !== 'manual').map((m) => m.reason),
  );
  const txs = data.transactions.filter((t) => monthKey(t.date) === month);
  const pending: { amount: number; reason: GoalMovement['reason']; detail: string }[] = [];

  if (r.roundUp && !already.has('roundup')) {
    const card = txs.filter((t) => t.amount < 0 && (t.channel === 'card' || t.channel === 'cash'));
    const total = card.reduce((s, t) => s + roundUpAmount(t.amount, r.roundUpTo), 0);
    if (total > 0) pending.push({ amount: total, reason: 'roundup', detail: `Redondeo de ${card.length} compras` });
  }
  if (r.percentOfIncome > 0 && !already.has('percent_income')) {
    const income = monthSummary(data, month).income;
    const amount = Math.round((income * r.percentOfIncome) / 100);
    if (amount > 0) pending.push({ amount, reason: 'percent_income', detail: `${r.percentOfIncome} % de los ingresos` });
  }
  if (r.smartSave && !already.has('smart')) {
    const amount = safeToSave(data, month);
    if (amount > 0) pending.push({ amount, reason: 'smart', detail: 'Excedente seguro según tus hábitos' });
  }

  // Simula el reparto acumulando lo ya asignado para no sobrepasar objetivos.
  let goals = data.goals.map((g) => ({ ...g }));
  const proposals: SavingProposal[] = [];
  for (const p of pending) {
    for (const part of distribute(goals, p.amount)) {
      proposals.push({ goalId: part.goalId, amount: part.amount, reason: p.reason, detail: p.detail });
      goals = goals.map((g) => (g.id === part.goalId ? { ...g, saved: g.saved + part.amount } : g));
    }
  }
  return proposals;
}

export function applyGoalMovement(data: AppData, goalId: string, amount: number, reason: GoalMovement['reason'], date: string): AppData {
  return {
    ...data,
    goals: data.goals.map((g) => (g.id === goalId ? { ...g, saved: Math.max(0, g.saved + amount) } : g)),
    goalMovements: [...data.goalMovements, { id: uid(), goalId, date, amount, reason }],
  };
}

/** Aportación mensual necesaria para llegar al objetivo en la fecha límite. */
export function monthlyNeeded(goal: Goal, fromMonth: string): number | null {
  if (!goal.deadline) return null;
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = goal.deadline.slice(0, 7).split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) + 1;
  const left = goal.target - goal.saved;
  if (left <= 0) return 0;
  return months > 0 ? Math.ceil(left / months) : left;
}

