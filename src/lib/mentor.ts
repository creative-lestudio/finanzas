import { budgetStatus } from './budgets';
import { toBase } from './fx';
import { healthReport, netWorth } from './health';
import { t as tr } from './i18n';
import { detectAntExpenses, detectSubscriptions, isActive, monthSummary } from './insights';
import { addMonths, daysBetween, formatMoney, today } from './money';
import { statusOf } from './debts';
import type { AppData, Profile } from './types';

// Mentor financiero: reglas locales (nada sale del dispositivo) que miran tus datos y dicen
//  · warn   → algo se está haciendo mal (gastas más de lo que ingresas, presupuesto pasado, tasa vieja…)
//  · tip    → una decisión o situación en la que conviene pararse a pensar
//  · praise → lo estás haciendo bien: te lo reconocemos.
export type MentorKind = 'warn' | 'tip' | 'praise';

export interface MentorMsg {
  id: string;
  kind: MentorKind;
  title: string;
  text: string;
  /** Lección relacionada. */
  lesson?: string;
  /** Pantalla a la que llevar. */
  go?: 'plan' | 'accounts' | 'transactions' | 'fx' | 'debts' | 'subs';
  goLabel?: string;
}

const RANK: Record<MentorKind, number> = { warn: 0, tip: 1, praise: 2 };

/** Meses de gastos que cubre tu dinero líquido. */
export function emergencyMonths(data: AppData, now = today()): number {
  const month = now.slice(0, 7);
  const hist = [1, 2, 3].map((i) => monthSummary(data, addMonths(month, -i))).filter((m) => m.expenses > 0);
  const avg = hist.length ? hist.reduce((s, m) => s + m.expenses, 0) / hist.length : monthSummary(data, month).expenses;
  if (avg <= 0) return netWorth(data).liquid > 0 ? 6 : 0;
  return Math.max(0, netWorth(data).liquid) / avg;
}

const monthIncome = (data: AppData, now: string) => {
  const month = now.slice(0, 7);
  const cur = monthSummary(data, month).income;
  if (cur > 0) return cur;
  const hist = [1, 2, 3].map((i) => monthSummary(data, addMonths(month, -i))).filter((m) => m.income > 0);
  return hist.length ? hist.reduce((s, m) => s + m.income, 0) / hist.length : 0;
};

export function mentorMessages(data: AppData, now = today()): MentorMsg[] {
  const out: MentorMsg[] = [];
  const month = now.slice(0, 7);
  const day = Number(now.slice(8));
  const base = data.settings.currency;
  const ms = monthSummary(data, month);
  const profile: Profile | undefined = data.settings.profile;
  const months = emergencyMonths(data, now);
  const nw = netWorth(data);
  const money = (c: number) => formatMoney(c, base);
  const txs = data.transactions;
  const lastTx = txs.reduce((m, x) => (x.date > m ? x.date : m), '');

  // ---------- Avisos: algo se está haciendo mal ----------
  if (ms.income > 0 && ms.expenses > ms.income && day >= 8) {
    out.push({ id: 'warn-overspend', kind: 'warn', title: tr('Gastas más de lo que ingresas'), text: tr('Este mes llevas {spent} de gastos frente a {income} de ingresos. Si sigue así, tu dinero se acaba antes de fin de mes. Revisa dónde se va con el resumen por categoría.', { spent: money(ms.expenses), income: money(ms.income) }), lesson: 'presupuesto', go: 'transactions', goLabel: tr('Ver en qué gasto') });
  }
  for (const b of budgetStatus(data, month, day)) {
    if (b.state === 'over') {
      const name = data.categories.find((c) => c.id === b.budget.categoryId)?.name ?? '';
      out.push({ id: `warn-budget-${b.budget.id}`, kind: 'warn', title: tr('Te pasaste del presupuesto'), text: tr('Llevas {spent} de {limit} en «{name}». Pausa los gastos de esa categoría o ajusta el tope si de verdad era poco realista.', { spent: money(b.spent), limit: money(b.limit), name: tr(name) }), go: 'plan', goLabel: tr('Ver presupuestos') });
    }
  }
  const overdrawn = data.accounts.filter((a) => a.balance < 0 && a.kind !== 'card' && a.kind !== 'loan');
  if (overdrawn.length) {
    out.push({ id: 'warn-overdraft', kind: 'warn', title: tr('Cuenta en descubierto'), text: tr('«{name}» está en negativo. Los descubiertos suelen tener intereses muy altos: cúbrelo cuanto antes con tu dinero disponible.', { name: overdrawn[0].name }), go: 'accounts', goLabel: tr('Ver cuentas') });
  }
  if (data.accounts.some((a) => a.currency === 'VES') && !data.settings.offlineOnly) {
    const latest = data.rates.reduce((m, r) => (r.date > m ? r.date : m), '');
    const age = latest ? daysBetween(latest, now) : 999;
    if (age >= 5) out.push({ id: 'warn-rates', kind: 'warn', title: tr('Tus bolívares usan una tasa vieja'), text: latest ? tr('La última tasa guardada es de hace {n} días: el valor de tus Bs puede estar muy desfasado. Actualízala en Divisas.', { n: age }) : tr('No hay ninguna tasa guardada: tus bolívares no se pueden valorar. Añade la tasa de hoy en Divisas.'), go: 'fx', goLabel: tr('Actualizar tasas') });
  }
  const overdueDebt = (data.debts ?? []).find((d) => statusOf(d, now).overdue);
  if (overdueDebt) {
    out.push({ id: 'warn-debt-overdue', kind: 'warn', title: tr('Tienes una deuda vencida'), text: tr('La deuda con {person} está vencida. Pagar a tiempo evita recargos y problemas de confianza; si no puedes, renegocia un plan de pago.', { person: overdueDebt.person }), lesson: 'deudas', go: 'debts', goLabel: tr('Ver deudas') });
  }

  // ---------- Consejos: situaciones para pararse a pensar ----------
  if (nw.liquid > 0 || ms.expenses > 0) {
    if (months < 1 && ms.expenses > 0) out.push({ id: 'tip-emergency', kind: 'tip', title: tr('Empieza por un colchón'), text: tr('Tu dinero disponible cubre menos de 1 mes de gastos. Antes que invertir o gastar en extras, aparta un colchón: primero 1 mes y luego 3 a 6.'), lesson: 'fondo-emergencia', go: 'plan', goLabel: tr('Crear una meta') });
    else if (months < 3 && ms.expenses > 0) out.push({ id: 'tip-emergency3', kind: 'tip', title: tr('Tu colchón aún es corto'), text: tr('Cubres {n} meses de gastos. La meta mínima son 3 meses; con 6 duermes tranquilo ante un imprevisto.', { n: months.toFixed(1) }), lesson: 'fondo-emergencia', go: 'plan', goLabel: tr('Crear una meta') });
  }
  if (profile?.goal === 'invest' && months < 3 && ms.expenses > 0) {
    out.push({ id: 'tip-invest-first', kind: 'tip', title: tr('Antes de invertir'), text: tr('Quieres invertir, pero tu colchón es de {n} meses. Regla básica: no inviertas el dinero que podrías necesitar en un imprevisto.', { n: months.toFixed(1) }), lesson: 'empezar-a-invertir' });
  }
  if (months >= 6 && (profile?.level === 'starter' || profile?.level === 'advanced' || profile?.goal === 'invest' || profile?.goal === 'grow') && nw.liquid > 0) {
    out.push({ id: 'tip-idle-cash', kind: 'tip', title: tr('Tienes dinero quieto'), text: tr('Cubres {n} meses de gastos. Lo que supere tu colchón pierde valor con la inflación si se queda parado: valora destinarlo a tus metas o a invertir con riesgo que aguantes.', { n: months.toFixed(1) }), lesson: 'diversificar' });
  }
  const income = monthIncome(data, now);
  const subs = detectSubscriptions(data).filter((s) => s.kind === 'subscription' && isActive(s, now));
  const subsMonthly = subs.reduce((s, x) => s + x.yearlyBase, 0) / 12;
  if (income > 0 && subsMonthly / income > 0.05) {
    out.push({ id: 'tip-subs', kind: 'tip', title: tr('Muchas suscripciones'), text: tr('Tus {n} suscripciones suman {amount} al mes. Cancela las que no usaste este mes: es el ahorro más fácil.', { n: subs.length, amount: money(subsMonthly) }), go: 'subs', goLabel: tr('Revisar') });
  }
  const ants = detectAntExpenses(data, now);
  if (income > 0 && ants.total / income > 0.05) {
    out.push({ id: 'tip-ants', kind: 'tip', title: tr('Los gastos pequeños pesan'), text: tr('Tus compras pequeñas ya suman {amount} en 30 días (unos {year} al año). No es prohibirte nada: elige a cuáles les dices que no.', { amount: money(ants.total), year: money(ants.yearly) }), lesson: 'gastos-hormiga' });
  }
  const monthTx = txs.filter((x) => x.date.startsWith(month) && x.amount < 0 && !x.exchangeId);
  if (monthTx.length >= 8 && monthTx.filter((x) => x.categoryId === 'other').length / monthTx.length > 0.25) {
    out.push({ id: 'tip-uncategorized', kind: 'tip', title: tr('Muchos gastos sin categoría'), text: tr('Más de una cuarta parte de tus gastos están en «Otros». Si no sabes en qué se va el dinero, no puedes controlarlo: asigna categorías (la app aprende de ti).'), go: 'transactions', goLabel: tr('Poner categorías') });
  }
  if (lastTx && daysBetween(lastTx, now) >= 7 && data.accounts.length) {
    out.push({ id: 'tip-stale', kind: 'tip', title: tr('Hace días que no registras'), text: tr('Tu último movimiento es de hace {n} días. Registrar tarda 3 segundos y es lo que mantiene tus números reales; prueba a dictarlo con la voz.', { n: daysBetween(lastTx, now) }) });
  }

  // ---------- Felicitaciones ----------
  const savingsRate = ms.income > 0 ? (ms.income - ms.expenses) / ms.income : 0;
  if (ms.income > 0 && savingsRate >= 0.2 && day >= 12) out.push({ id: `praise-savings@${month}`, kind: 'praise', title: tr('¡Estás ahorrando como se debe!'), text: tr('Este mes ahorras el {pct} % de tus ingresos: ya superas el 20 % recomendado. Sigue así y pon ese ahorro a trabajar.', { pct: Math.round(savingsRate * 100) }), lesson: 'interes-compuesto' });
  const bs = budgetStatus(data, month, day);
  if (bs.length >= 2 && bs.every((b) => b.state === 'ok') && day >= 15) out.push({ id: `praise-budgets@${month}`, kind: 'praise', title: tr('¡Todos tus presupuestos en orden!'), text: tr('Llevas el mes con todos los topes bajo control. Eso es disciplina de verdad.') });
  if (months >= 6) out.push({ id: 'praise-emergency6', kind: 'praise', title: tr('¡Colchón de 6 meses!'), text: tr('Tu dinero cubre 6 meses o más de gastos. Un imprevisto ya no te hunde: ahora puedes plantearte invertir con calma.'), lesson: 'empezar-a-invertir' });
  else if (months >= 3) out.push({ id: 'praise-emergency3', kind: 'praise', title: tr('¡Ya tienes 3 meses de colchón!'), text: tr('Has superado el mínimo recomendado de fondo de emergencia. El siguiente objetivo son 6 meses.') });
  const debts = data.debts ?? [];
  if (debts.length && debts.every((d) => statusOf(d, now).settled)) out.push({ id: 'praise-debt-free', kind: 'praise', title: tr('¡Sin deudas pendientes!'), text: tr('Has saldado todas tus deudas anotadas. Libera esa cuota mensual y envíala a tu colchón o a tus metas.') });
  const days7 = new Set(txs.filter((x) => daysBetween(x.date, now) >= 0 && daysBetween(x.date, now) < 7 && !x.recurringId).map((x) => x.date));
  if (days7.size >= 5) out.push({ id: `praise-streak@${now.slice(0, 7)}-${Math.floor(day / 8)}`, kind: 'praise', title: tr('¡Constancia!'), text: tr('Has registrado movimientos {n} días de los últimos 7. El hábito de anotar es la base de todo lo demás.', { n: days7.size }) });
  const learned = data.settings.learn?.done.length ?? 0;
  if (learned >= 3) out.push({ id: `praise-learn${learned >= 8 ? 8 : 3}`, kind: 'praise', title: tr('¡Aprendiendo en serio!'), text: tr('Llevas {n} lecciones completadas. Cada decisión informada ahorra o gana más que cualquier truco.', { n: learned }) });
  void healthReport;

  // Filtra lo aplazado / ya felicitado y ordena: avisos, consejos, felicitaciones.
  const snoozed = data.settings.mentor?.snoozed ?? {};
  const seen = new Set(data.settings.mentor?.seen ?? []);
  return out
    .filter((m) => (m.kind === 'praise' ? !seen.has(m.id) : !(snoozed[m.id] && snoozed[m.id] >= now)))
    .sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** Aplaza un aviso/consejo unos días o da por vista una felicitación. */
export function dismissMentor(data: AppData, msg: MentorMsg, now = today()): AppData {
  const cur = data.settings.mentor ?? { snoozed: {}, seen: [] };
  const until = new Date(Date.parse(`${now}T12:00:00Z`) + 3 * 86400000).toISOString().slice(0, 10);
  const mentor = msg.kind === 'praise' ? { ...cur, seen: [...new Set([...cur.seen, msg.id])] } : { ...cur, snoozed: { ...cur.snoozed, [msg.id]: until } };
  return { ...data, settings: { ...data.settings, mentor } };
}

/** Felicitaciones que aparecen al pasar de `before` a `after` (para avisar justo al hacerlo bien). */
export function newPraise(before: AppData, after: AppData, now = today()): MentorMsg | null {
  const was = new Set(mentorMessages(before, now).filter((m) => m.kind === 'praise').map((m) => m.id));
  return mentorMessages(after, now).find((m) => m.kind === 'praise' && !was.has(m.id)) ?? null;
}

// ---------- Consejos en el momento de decidir ----------
export interface DecisionCtx {
  /** Importe en céntimos de la moneda de la cuenta (positivo). */
  amount: number;
  kind: 'expense' | 'income';
  accountId?: string;
  categoryId?: string;
  description?: string;
  date?: string;
}
export interface DecisionTip {
  level: 'warn' | 'tip';
  text: string;
}

/** Avisos y consejos mientras se registra un movimiento: importe raro, duplicado, cuenta en negativo, gasto grande… */
export function decisionTips(data: AppData, c: DecisionCtx, now = today()): DecisionTip[] {
  const out: DecisionTip[] = [];
  if (c.kind !== 'expense' || !c.amount) return out;
  const acc = data.accounts.find((a) => a.id === c.accountId);
  const cur = acc?.currency ?? data.settings.currency;
  const date = c.date ?? now;
  const inBase = toBase(data, c.amount, cur, date);
  const income = monthIncome(data, now);

  // Duplicado probable: mismo importe y cuenta en los últimos 2 días.
  const dup = data.transactions.find((t) => t.accountId === c.accountId && t.amount === -c.amount && Math.abs(daysBetween(t.date, date)) <= 2 && (!c.description || t.description.toLowerCase().includes(c.description.toLowerCase().slice(0, 6))));
  if (dup) out.push({ level: 'warn', text: tr('Ya hay un gasto igual ({amount}) de hace poco. ¿Seguro que no lo estás duplicando?', { amount: formatMoney(c.amount, cur) }) });

  // Importe muy superior a lo habitual en esa categoría.
  if (c.categoryId) {
    const same = data.transactions.filter((t) => t.categoryId === c.categoryId && t.amount < 0 && t.accountId === c.accountId).map((t) => -t.amount).sort((a, b) => a - b);
    if (same.length >= 4) {
      const median = same[Math.floor(same.length / 2)];
      if (c.amount >= median * 8) out.push({ level: 'warn', text: tr('Este importe es unas {n} veces mayor que tu gasto típico en esta categoría. Revisa que no sobre un cero ni una coma.', { n: Math.round(c.amount / median) }) });
    }
  }
  // Dejaría la cuenta en negativo.
  if (acc && acc.kind !== 'card' && acc.kind !== 'loan' && acc.balance - c.amount < 0 && acc.balance >= 0) {
    out.push({ level: 'warn', text: tr('Este gasto dejaría «{name}» en negativo ({balance}). Elige otra cuenta o confirma que es lo que quieres.', { name: acc.name, balance: formatMoney(acc.balance - c.amount, cur) }) });
  }
  // Gasto grande respecto a tus ingresos: regla de las 24 horas.
  if (income > 0 && inBase >= income * 0.2) {
    out.push({ level: 'tip', text: tr('Es un gasto grande: {pct} % de lo que ingresas en un mes. Si no es urgente, espera 24 horas antes de decidir; si es necesario, mira cómo afecta a tu colchón.', { pct: Math.round((inBase / income) * 100) }) });
  }
  return out;
}

/** Consejo estático al tomar otras decisiones (deuda, meta, inversión, cambio de divisa). */
export function decisionAdvice(data: AppData, topic: 'debt-owe' | 'goal' | 'invest' | 'exchange'): string | null {
  const months = emergencyMonths(data);
  if (topic === 'debt-owe') return tr('Antes de endeudarte, pregúntate: ¿puedo pagar la cuota sin tocar mi colchón? Si tienes varias deudas, paga primero la de mayor interés (método avalancha).');
  if (topic === 'goal') return months < 3 ? tr('Consejo: antes de metas grandes, completa un colchón de 3 meses. Una meta sin colchón se rompe con el primer imprevisto.') : tr('Una buena meta tiene cifra, fecha y aporte mensual. Fija un aporte automático el día que cobras.');
  if (topic === 'invest') return months < 3 ? tr('Cuidado: tu colchón aún es corto. Invierte solo dinero que no necesites en los próximos años.') : tr('Invertir lleva riesgo: nunca pongas todo en un solo activo y no inviertas con dinero prestado.');
  if (topic === 'exchange') return tr('Antes de cambiar, compara plataformas y comisiones: una diferencia de 2-3 % en cada cambio se acumula mucho.');
  return null;
}
