import type { SharedExpense } from './types';

/** Reparte un importe a partes iguales; los céntimos sobrantes van a los primeros. */
export function splitEqual(amount: number, members: string[]): Record<string, number> {
  const base = Math.floor(amount / members.length);
  let rest = amount - base * members.length;
  const out: Record<string, number> = {};
  for (const m of members) {
    out[m] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return out;
}

/** Reparte según pesos (porcentajes, partes...). La suma siempre cuadra con el total. */
export function splitByWeights(amount: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const totalW = entries.reduce((s, [, w]) => s + w, 0);
  if (!totalW) return {};
  const raw = entries.map(([m, w]) => [m, (amount * w) / totalW] as const);
  const out: Record<string, number> = Object.fromEntries(raw.map(([m, v]) => [m, Math.floor(v)]));
  let rest = amount - Object.values(out).reduce((s, v) => s + v, 0);
  // Método del resto mayor.
  for (const [m] of [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (rest <= 0) break;
    out[m]++;
    rest--;
  }
  return out;
}

/** Saldo neto de cada miembro: positivo = le deben, negativo = debe. */
export function balances(expenses: SharedExpense[], members: string[]): Record<string, number> {
  const bal: Record<string, number> = Object.fromEntries(members.map((m) => [m, 0]));
  for (const e of expenses) {
    bal[e.paidBy] = (bal[e.paidBy] ?? 0) + e.amount;
    for (const [m, share] of Object.entries(e.shares)) bal[m] = (bal[m] ?? 0) - share;
  }
  return bal;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Calcula el mínimo práctico de pagos para saldar las deudas (algoritmo voraz). */
export function settleUp(bal: Record<string, number>): Transfer[] {
  const debtors = Object.entries(bal).filter(([, v]) => v < 0).map(([m, v]) => ({ m, v: -v })).sort((a, b) => b.v - a.v);
  const creditors = Object.entries(bal).filter(([, v]) => v > 0).map(([m, v]) => ({ m, v })).sort((a, b) => b.v - a.v);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount > 0) out.push({ from: debtors[i].m, to: creditors[j].m, amount });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v === 0) i++;
    if (creditors[j].v === 0) j++;
  }
  return out;
}
