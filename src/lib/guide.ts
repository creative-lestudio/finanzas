import type { AppData } from './types';

/** Estado de la guía de primer uso (recorrido + tres tareas). Se guarda en los ajustes. */
export interface Guide {
  step: 'tour' | 'tasks' | 'done';
  accounts: boolean;
  movement: boolean;
  budget: boolean;
  /** Movimientos y presupuestos creados «como prueba»: se borran al terminar la guía. */
  testTx: string[];
  testBudgets: string[];
}

export const newGuide = (step: Guide['step'] = 'tour'): Guide => ({ step, accounts: false, movement: false, budget: false, testTx: [], testBudgets: [] });

export const guideOf = (d: Pick<AppData, 'settings'>): Guide | undefined => d.settings.guide;
/** La guía está en marcha: mientras tanto no se muestran Face ID, instalar ni sincronizar. */
export const guideActive = (d: Pick<AppData, 'settings'>): boolean => {
  const g = d.settings.guide;
  return !!g && g.step !== 'done';
};
export const guideTasks = (d: Pick<AppData, 'settings'>): Guide | undefined => (d.settings.guide?.step === 'tasks' ? d.settings.guide : undefined);

export function patchGuide(d: AppData, p: Partial<Guide>): AppData {
  const g = d.settings.guide ?? newGuide('tasks');
  return { ...d, settings: { ...d.settings, guide: { ...g, ...p } } };
}

/** Cierra la guía (completada u omitida) y elimina todo lo creado como prueba. */
export function finishGuide(d: AppData): AppData {
  const g = d.settings.guide ?? newGuide('done');
  const txs = d.transactions.filter((t) => g.testTx.includes(t.id));
  const drop = new Set(g.testTx);
  const accounts = d.accounts.map((a) => ({ ...a, balance: a.balance - txs.filter((t) => t.accountId === a.id).reduce((s, t) => s + t.amount, 0) }));
  return {
    ...d,
    accounts,
    transactions: d.transactions.filter((t) => !drop.has(t.id)),
    budgets: d.budgets.filter((b) => !g.testBudgets.includes(b.id)),
    settings: { ...d.settings, guide: { ...g, step: 'done', testTx: [], testBudgets: [] }, checklistHidden: true, tourDone: true },
  };
}

export const guideComplete = (g?: Guide): boolean => !!g && g.step === 'tasks' && g.accounts && g.movement && g.budget;
