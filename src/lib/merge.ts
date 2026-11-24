import type { AppData, Debt } from './types';

// Fusión a tres bandas para la sincronización: compara la última versión
// sincronizada (base) con los cambios locales y los remotos, elemento a
// elemento por id. Así dos dispositivos pueden añadir movimientos a la vez
// sin pisarse, y los borrados se respetan.

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

type WithId = { id: string };

export function mergeById<T extends WithId>(base: T[], local: T[], remote: T[], preferLocal: boolean, combine?: (b: T, l: T, r: T) => T): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const l = new Map(local.map((x) => [x.id, x]));
  const r = new Map(remote.map((x) => [x.id, x]));
  const ids = [...local.map((x) => x.id), ...remote.map((x) => x.id).filter((id) => !l.has(id))];
  const out: T[] = [];
  for (const id of ids) {
    const bx = b.get(id);
    const lx = l.get(id);
    const rx = r.get(id);
    if (lx && rx) {
      if (eq(lx, rx)) out.push(lx);
      else if (bx && combine) out.push(combine(bx, lx, rx));
      else if (bx && eq(lx, bx)) out.push(rx);
      else if (bx && eq(rx, bx)) out.push(lx);
      else out.push(preferLocal ? lx : rx);
    } else if (lx) {
      // Existía antes y el otro dispositivo lo borró: se borra salvo que aquí se haya modificado.
      if (!bx || !eq(lx, bx)) out.push(lx);
    } else if (rx) {
      if (!bx || !eq(rx, bx)) out.push(rx);
    }
  }
  return out;
}

function mergeMap(base: Record<string, string>, local: Record<string, string>, remote: Record<string, string>, preferLocal: boolean) {
  const out: Record<string, string> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const [b, l, r] = [base[k], local[k], remote[k]];
    if (l !== undefined && r !== undefined) out[k] = l === r || r === b ? l : l === b ? r : preferLocal ? l : r;
    else if (l !== undefined && (b === undefined || l !== b)) out[k] = l;
    else if (r !== undefined && (b === undefined || r !== b)) out[k] = r;
  }
  return out;
}

const pick = <T,>(b: T, l: T, r: T, preferLocal: boolean): T => (eq(l, r) ? l : eq(l, b) ? r : eq(r, b) ? l : preferLocal ? l : r);

/**
 * Los saldos y lo ahorrado en huchas son acumulativos: si ambos dispositivos
 * los cambiaron, se suman las dos variaciones en vez de quedarse con una.
 */
function combineBalance<T extends WithId & { balance: number }>(b: T, l: T, r: T): T {
  const { balance: _lb, ...lRest } = l;
  const { balance: _rb, ...rRest } = r;
  const { balance: _bb, ...bRest } = b;
  const rest = eq(lRest, rRest) ? lRest : eq(lRest, bRest) ? rRest : lRest;
  return { ...(rest as T), balance: b.balance + (l.balance - b.balance) + (r.balance - b.balance) };
}

/** Dos dispositivos pueden haber anotado pagos distintos de la misma deuda: se unen por id. */
function combineDebt(b: Debt, l: Debt, r: Debt): Debt {
  const ids = new Set(l.payments.map((p) => p.id));
  const bIds = new Set(b.payments.map((p) => p.id));
  const fromRemote = r.payments.filter((p) => !ids.has(p.id) && !bIds.has(p.id));
  const keptByRemote = new Set(r.payments.map((p) => p.id));
  // Un pago que estaba en la base y ya no está en un lado se borró allí.
  const local = l.payments.filter((p) => !bIds.has(p.id) || keptByRemote.has(p.id));
  const { payments: _l, ...lRest } = l;
  const { payments: _r, ...rRest } = r;
  const { payments: _b, ...bRest } = b;
  const rest = eq(lRest, rRest) ? lRest : eq(lRest, bRest) ? rRest : lRest;
  return { ...(rest as Debt), payments: [...local, ...fromRemote].sort((x, y) => x.date.localeCompare(y.date)) };
}

function combineSaved<T extends WithId & { saved: number }>(b: T, l: T, r: T): T {
  const { saved: _l, ...lRest } = l;
  const { saved: _r, ...rRest } = r;
  const { saved: _b, ...bRest } = b;
  const rest = eq(lRest, rRest) ? lRest : eq(lRest, bRest) ? rRest : lRest;
  return { ...(rest as T), saved: Math.max(0, b.saved + (l.saved - b.saved) + (r.saved - b.saved)) };
}

export function merge3(base: AppData, local: AppData, remote: AppData): AppData {
  const preferLocal = (local.updatedAt ?? '') >= (remote.updatedAt ?? '');
  // Un movimiento nuevo con el mismo id en los dos lados (p. ej. un recurrente generado a la vez en dos
  // dispositivos) suma su importe dos veces al fusionar los saldos: se descuenta una.
  const inBase = new Set(base.transactions.map((t) => t.id));
  const inRemote = new Map(remote.transactions.map((t) => [t.id, t]));
  const twice = local.transactions.filter((t) => !inBase.has(t.id) && inRemote.has(t.id));
  const lAcc = new Map(local.accounts.map((a) => [a.id, a]));
  const rAcc = new Map(remote.accounts.map((a) => [a.id, a]));
  const accounts = mergeById(base.accounts, local.accounts, remote.accounts, preferLocal, combineBalance).map((a) => {
    // Solo hay doble suma cuando los saldos de los dos lados se combinaron (eran distintos).
    if (eq(lAcc.get(a.id), rAcc.get(a.id))) return a;
    return { ...a, balance: a.balance - twice.filter((t) => t.accountId === a.id).reduce((sum, t) => sum + t.amount, 0) };
  });
  return {
    ...local,
    accounts,
    recurring: mergeById(base.recurring ?? [], local.recurring ?? [], remote.recurring ?? [], preferLocal),
    debts: mergeById(base.debts ?? [], local.debts ?? [], remote.debts ?? [], preferLocal, combineDebt),
    categories: mergeById(base.categories, local.categories, remote.categories, preferLocal),
    transactions: mergeById(base.transactions, local.transactions, remote.transactions, preferLocal),
    budgets: mergeById(base.budgets, local.budgets, remote.budgets, preferLocal),
    goals: mergeById(base.goals, local.goals, remote.goals, preferLocal, combineSaved),
    goalMovements: mergeById(base.goalMovements, local.goalMovements, remote.goalMovements, preferLocal),
    groups: mergeById(base.groups, local.groups, remote.groups, preferLocal),
    sharedExpenses: mergeById(base.sharedExpenses, local.sharedExpenses, remote.sharedExpenses, preferLocal),
    rules: mergeById(base.rules, local.rules, remote.rules, preferLocal),
    rates: mergeById(base.rates, local.rates, remote.rates, preferLocal),
    exchanges: mergeById(base.exchanges, local.exchanges, remote.exchanges, preferLocal),
    learned: mergeMap(base.learned, local.learned, remote.learned, preferLocal),
    dismissedAlerts: [...new Set([...local.dismissedAlerts, ...remote.dismissedAlerts])],
    savingsRules: pick(base.savingsRules, local.savingsRules, remote.savingsRules, preferLocal),
    settings: pick(base.settings, local.settings, remote.settings, preferLocal),
    updatedAt: new Date().toISOString(),
  };
}
