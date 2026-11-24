import { learnFromCorrection } from './categorize';
import type { AppData, Transaction } from './types';

export type TxPatch = Partial<Pick<Transaction, 'accountId' | 'date' | 'amount' | 'description' | 'categoryId' | 'note' | 'fx'>>;

/**
 * Edita un movimiento y recalcula los saldos: si cambia el importe o la cuenta, se deshace el efecto
 * anterior y se aplica el nuevo. Nunca crea ni pierde dinero: la suma de saldos solo cambia en la
 * diferencia exacta del importe editado.
 */
export function editTransaction(data: AppData, id: string, patch: TxPatch): AppData {
  const old = data.transactions.find((t) => t.id === id);
  if (!old) return data;
  const accountId = patch.accountId ?? old.accountId;
  if (!data.accounts.some((a) => a.id === accountId)) return data;
  const amount = patch.amount ?? old.amount;
  const categoryChanged = patch.categoryId !== undefined && patch.categoryId !== old.categoryId;
  const next: Transaction = {
    ...old,
    ...patch,
    accountId,
    amount,
    categorySource: categoryChanged ? 'user' : old.categorySource,
  };
  // El equivalente en otra moneda sigue la misma proporción si cambia el importe y no se indica otro.
  if (patch.fx === undefined && old.fx && old.fx.rate > 0 && amount !== old.amount) {
    next.fx = { ...old.fx, amount: Math.round(Math.abs(amount) / old.fx.rate) };
  }
  // Si pasa a una cuenta de otra moneda, el equivalente anterior ya no vale.
  const cur = (aid: string) => data.accounts.find((a) => a.id === aid)?.currency;
  if (patch.fx === undefined && accountId !== old.accountId && cur(accountId) !== cur(old.accountId)) next.fx = undefined;

  let out: AppData = {
    ...data,
    transactions: data.transactions.map((t) => (t.id === id ? next : t)),
    accounts: data.accounts.map((a) => {
      let balance = a.balance;
      if (a.id === old.accountId) balance -= old.amount;
      if (a.id === accountId) balance += amount;
      return balance === a.balance ? a : { ...a, balance };
    }),
  };
  if (categoryChanged) out = learnFromCorrection(out, next, patch.categoryId!);
  return out;
}
