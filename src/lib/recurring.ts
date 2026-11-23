import type { AppData, Recurring, Transaction } from './types';

type Freq = Recurring['freq'];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Siguiente fecha de una regla tras `date`. Los meses cortos usan su último día (31 → 28/30). */
export function nextOccurrence(date: string, freq: Freq, day: number): string {
  const [y, m, d] = date.split('-').map(Number);
  if (freq === 'weekly') return iso(new Date(Date.UTC(y, m - 1, d + 7)));
  if (freq === 'yearly') {
    const ny = y + 1;
    return iso(new Date(Date.UTC(ny, m - 1, Math.min(day, daysIn(ny, m - 1)))));
  }
  const total = y * 12 + (m - 1) + 1;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  return iso(new Date(Date.UTC(ny, nm, Math.min(day, daysIn(ny, nm)))));
}

export const FREQ_LABEL: Record<Freq, string> = { weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };

export const recurringTxId = (r: Pick<Recurring, 'id'>, date: string) => `rec-${r.id}-${date}`;

/** Crea los movimientos que ya tocan (hasta hoy) y adelanta cada regla. Ids fijos: dos dispositivos no duplican. */
export function processRecurring(data: AppData, now: string): { data: AppData; created: number } {
  let created = 0;
  const txs: Transaction[] = [];
  const delta = new Map<string, number>();
  const have = new Set(data.transactions.map((t) => t.id));
  const rules = (data.recurring ?? []).map((r) => {
    if (!r.active) return r;
    let next = r.next;
    let active: boolean = r.active;
    for (let i = 0; i < 60 && next <= now; i++) {
      if (r.end && next > r.end) break;
      const id = recurringTxId(r, next);
      if (!have.has(id) && data.accounts.some((a) => a.id === r.accountId)) {
        txs.push({ id, accountId: r.accountId, date: next, amount: r.amount, description: r.description, categoryId: r.categoryId, categorySource: 'rule', channel: 'direct_debit', recurringId: r.id });
        have.add(id);
        delta.set(r.accountId, (delta.get(r.accountId) ?? 0) + r.amount);
        created++;
      }
      next = nextOccurrence(next, r.freq, r.day);
    }
    if (r.end && next > r.end) active = false;
    return next === r.next && active === r.active ? r : { ...r, next, active };
  });
  if (!created && rules.every((r, i) => r === (data.recurring ?? [])[i])) return { data, created: 0 };
  return {
    created,
    data: {
      ...data,
      recurring: rules,
      transactions: [...data.transactions, ...txs],
      accounts: data.accounts.map((a) => (delta.has(a.id) ? { ...a, balance: a.balance + delta.get(a.id)! } : a)),
    },
  };
}

/** Importe mensual aproximado de una regla (semanal ×52/12, anual ÷12). */
export const monthlyEquivalent = (r: Pick<Recurring, 'amount' | 'freq'>): number =>
  Math.round(r.freq === 'weekly' ? (r.amount * 52) / 12 : r.freq === 'yearly' ? r.amount / 12 : r.amount);
