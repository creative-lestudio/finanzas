import { goalProgress } from './goals';
import { monthSummary } from './insights';
import { addMonths, daysInMonth, formatMoney } from './money';
import type { AppData } from './types';
import { t } from './i18n';

// El consejo del día del asistente en Inicio. Se calcula en el dispositivo,
// sin IA: compara el ritmo de gasto de este mes con tu media y mira tus metas.

export type CoachPose = 'feliz' | 'pensando' | 'complice' | 'curioso' | 'seguro' | 'analiza' | 'insights' | 'explica' | 'motiva' | 'acompana' | 'hola';

export interface CoachTip {
  pose: CoachPose;
  title: string;
  text: string;
  /** Pregunta que se lleva al asesor si el usuario toca el consejo. */
  ask: string;
}

export function coachTip(data: AppData, month: string, day: number): CoachTip {
  const now = monthSummary(data, month);
  const hist = [1, 2, 3].map((i) => monthSummary(data, addMonths(month, -i))).filter((m) => m.expenses > 0);
  const share = Math.min(1, day / daysInMonth(month));
  const cat = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;

  // 1. La categoría que más se desvía de tu media (a estas alturas de mes).
  if (hist.length) {
    let worst: { id: string; pct: number; extra: number } | null = null;
    for (const [id, spent] of Object.entries(now.byCategory)) {
      const avg = hist.reduce((s, m) => s + (m.byCategory[id] ?? 0), 0) / hist.length;
      const expected = avg * share;
      if (expected < 2000 || spent <= expected * 1.2) continue;
      const pct = (spent - expected) / expected;
      if (!worst || spent - expected > worst.extra) worst = { id, pct, extra: spent - expected };
    }
    if (worst) {
      return {
        pose: 'insights',
        title: t('Te tengo un dato'),
        text: t('Este mes llevas un {pct} % más en {cat} que de costumbre ({extra} de más). ¿Vemos cómo ajustarlo?', { pct: Math.round(worst.pct * 100), cat: cat(worst.id).toLowerCase(), extra: formatMoney(worst.extra) }),
        ask: t('Este mes estoy gastando más en {cat}. ¿Qué me recomiendas para ajustarlo?', { cat: cat(worst.id) }),
      };
    }
  }

  // 2. Una meta a más de la mitad.
  const goal = data.goals.map((g) => goalProgress(data, g)).filter((p) => p.ratio >= 0.5 && p.ratio < 1).sort((a, b) => b.ratio - a.ratio)[0];
  if (goal) {
    return {
      pose: 'motiva',
      title: t('¡Vas por buen camino!'),
      text: t('Ya alcanzaste el {pct} % de tu meta «{name}».', { pct: Math.round(goal.ratio * 100), name: goal.goal.name }),
      ask: t('¿Cómo puedo terminar antes mi meta «{name}»?', { name: goal.goal.name }),
    };
  }

  // 3. Ahorro del mes.
  const saved = now.income - now.expenses;
  if (now.income > 0 && saved > 0) {
    return {
      pose: 'feliz',
      title: t('Buen mes'),
      text: t('Llevas {amount} ahorrados este mes. ¿Los ponemos a trabajar?', { amount: formatMoney(saved) }),
      ask: t('Este mes me sobran {amount}. ¿Qué hago con ellos?', { amount: formatMoney(saved) }),
    };
  }
  return {
    pose: 'hola',
    title: t('¡Hola!'),
    text: t('Registra tus gastos de hoy y te diré cómo vas. Puedes dictarlos.'),
    ask: t('Analiza mis finanzas y dime qué puedo mejorar.'),
  };
}
