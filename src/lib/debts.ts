import { toBase } from './fx';
import { today, uid } from './money';
import type { AppData, Debt, DebtPayment } from './types';

export const DEBT_CATEGORIES: Record<Debt['category'], { label: string; icon: string }> = {
  personal: { label: 'Amigos', icon: 'users' },
  family: { label: 'Familia', icon: 'heart' },
  bank: { label: 'Banco / préstamo', icon: 'bank' },
  card: { label: 'Tarjeta', icon: 'card' },
  business: { label: 'Negocio / clientes', icon: 'briefcase' },
  services: { label: 'Servicios / proveedores', icon: 'receipt' },
  other: { label: 'Otra', icon: 'box' },
};

export const PRIORITY_LABEL: Record<Debt['priority'], string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const PRIORITY_RANK: Record<Debt['priority'], number> = { high: 0, medium: 1, low: 2 };

export const FREQ_DEBT_LABEL = { weekly: 'Cada semana', biweekly: 'Cada 15 días', monthly: 'Cada mes' } as const;

export const paidOf = (d: Pick<Debt, 'payments'>): number => d.payments.reduce((s, p) => s + p.amount, 0);
export const remainingOf = (d: Pick<Debt, 'amount' | 'payments'>): number => Math.max(0, d.amount - paidOf(d));
export const isSettled = (d: Pick<Debt, 'amount' | 'payments'>): boolean => remainingOf(d) === 0;

const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const addMonthsKeepDay = (date: string, n: number, day: number): string => {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(day, last))).toISOString().slice(0, 10);
};

export interface Installment {
  n: number;
  date: string;
  amount: number;
  /** Ya cubierta por lo pagado hasta ahora. */
  paid: boolean;
}

/** Calendario de cuotas del plan: fechas fijas desde la primera; la última cuota lleva lo que reste. */
export function scheduleOf(d: Pick<Debt, 'amount' | 'payments' | 'plan'>): Installment[] {
  const plan = d.plan;
  if (!plan || plan.amount <= 0) return [];
  const count = Math.ceil(d.amount / plan.amount);
  const day = Number(plan.start.slice(8));
  const paid = paidOf(d);
  const out: Installment[] = [];
  let acc = 0;
  for (let i = 0; i < Math.min(count, 600); i++) {
    const date = plan.freq === 'weekly' ? addDays(plan.start, 7 * i) : plan.freq === 'biweekly' ? addDays(plan.start, 14 * i) : addMonthsKeepDay(plan.start, i, day);
    const amount = Math.min(plan.amount, d.amount - acc);
    acc += amount;
    out.push({ n: i + 1, date, amount, paid: paid >= acc });
  }
  return out;
}

export interface DebtStatus {
  remaining: number;
  paid: number;
  ratio: number;
  settled: boolean;
  overdue: boolean;
  /** Próxima cuota pendiente del plan, si lo hay. */
  next?: Installment;
  /** Fecha estimada de fin con el plan actual. */
  endsOn?: string;
}

export function statusOf(d: Debt, now = today()): DebtStatus {
  const remaining = remainingOf(d);
  const paid = paidOf(d);
  const sched = scheduleOf(d);
  const next = sched.find((i) => !i.paid);
  const settled = remaining === 0;
  const due = next?.date ?? d.dueDate;
  return { remaining, paid, ratio: d.amount ? Math.min(1, paid / d.amount) : 1, settled, overdue: !settled && !!due && due < now, next, endsOn: sched.length ? sched[sched.length - 1].date : undefined };
}

/** Ordena: pendientes antes que saldadas, vencidas primero, luego prioridad y fecha. */
export function sortDebts(list: Debt[], now = today()): Debt[] {
  return [...list].sort((a, b) => {
    const sa = statusOf(a, now);
    const sb = statusOf(b, now);
    if (sa.settled !== sb.settled) return sa.settled ? 1 : -1;
    if (sa.overdue !== sb.overdue) return sa.overdue ? -1 : 1;
    if (a.priority !== b.priority) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return (sa.next?.date ?? a.dueDate ?? '9999').localeCompare(sb.next?.date ?? b.dueDate ?? '9999');
  });
}

/** Totales pendientes en la moneda principal. */
export function debtTotals(data: Pick<AppData, 'debts' | 'rates' | 'settings'>, now = today()): { owed: number; owe: number; net: number; overdue: number } {
  let owed = 0;
  let owe = 0;
  let overdue = 0;
  for (const d of data.debts ?? []) {
    const v = toBase(data, remainingOf(d), d.currency, now);
    if (d.direction === 'owed') owed += v;
    else owe += v;
    if (statusOf(d, now).overdue) overdue++;
  }
  return { owed, owe, net: owed - owe, overdue };
}

export const newPayment = (amount: number, date: string, note?: string): DebtPayment => ({ id: uid(), date, amount, note: note?.trim() || undefined });

/** Cuota mensual necesaria para saldar en N meses. */
export const installmentFor = (remaining: number, months: number): number => (months > 0 ? Math.ceil(remaining / months) : remaining);
