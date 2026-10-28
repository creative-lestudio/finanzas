import { KEYWORD_RULES } from './defaults';
import { merchantKey, normalize } from './money';
import type { AppData, Category, Transaction } from './types';

const reCache = new Map<string, RegExp>();

/** Coincidencia por palabra completa (evita que "fee" case con "coffee"). */
export function matchesPattern(text: string, pattern: string): boolean {
  const p = normalize(pattern);
  if (!p) return false;
  let re = reCache.get(p);
  if (!re) {
    re = new RegExp(`(?<![a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`);
    reCache.set(p, re);
  }
  return re.test(text);
}

export function detectChannel(description: string): Transaction['channel'] {
  const t = normalize(description);
  if (t.includes('bizum')) return 'bizum';
  if (/\b(cajero|reintegro|retirada)\b/.test(t)) return 'atm';
  if (/\b(recibo|adeudo|domiciliacion|sepa dd)\b/.test(t)) return 'direct_debit';
  if (/\b(transferencia|transf|traspaso)\b/.test(t)) return 'transfer';
  if (/\b(compra|tarjeta|tarj|tpv|pos|visa|mastercard)\b/.test(t)) return 'card';
  return 'other';
}

export interface Categorization {
  categoryId: string;
  source: Transaction['categorySource'];
}

/**
 * Orden de prioridad: reglas del usuario > lo aprendido de sus correcciones >
 * palabras clave integradas > heurísticas por canal > categoría por defecto.
 */
export function categorize(
  description: string,
  amount: number,
  data: Pick<AppData, 'rules' | 'learned'>,
): Categorization {
  const text = normalize(description);

  for (const rule of data.rules) {
    if (matchesPattern(text, rule.pattern)) return { categoryId: rule.categoryId, source: 'rule' };
  }

  const learned = data.learned[merchantKey(description)];
  if (learned) return { categoryId: learned, source: 'learned' };

  const channel = detectChannel(description);
  if (channel === 'bizum') return { categoryId: amount >= 0 ? 'bizum_in' : 'bizum_out', source: 'rule' };

  for (const [pattern, categoryId] of KEYWORD_RULES) {
    if (!matchesPattern(text, pattern)) continue;
    if (categoryId === 'salary' && amount < 0) continue;
    return { categoryId, source: 'rule' };
  }

  if (channel === 'atm') return { categoryId: 'cash', source: 'rule' };
  return { categoryId: amount >= 0 ? 'other_income' : 'other', source: 'default' };
}

/** Registra la corrección del usuario para que los próximos movimientos del mismo comercio se clasifiquen igual. */
export function learnFromCorrection(data: AppData, tx: Transaction, categoryId: string): AppData {
  const key = merchantKey(tx.description);
  const learned = key ? { ...data.learned, [key]: categoryId } : data.learned;
  return {
    ...data,
    learned,
    transactions: data.transactions.map((t) => {
      if (t.id === tx.id) return { ...t, categoryId, categorySource: 'user' };
      // Reclasifica movimientos del mismo comercio que no hayan sido fijados a mano.
      if (key && t.categorySource !== 'user' && merchantKey(t.description) === key) {
        return { ...t, categoryId, categorySource: 'learned' };
      }
      return t;
    }),
  };
}

/**
 * Clasificación con IA (opcional). Solo se usa si el usuario lo activa y NO
 * está en modo sin terceros. Se envía únicamente la descripción y el signo
 * del importe, nunca IBAN ni saldos.
 */
export async function categorizeWithAI(
  items: { id: string; description: string; amount: number }[],
  categories: Category[],
  data: AppData,
): Promise<Record<string, string>> {
  if (!items.length) return {};
  const { callClaude, textOf } = await import('./ai');
  const ids = categories.map((c) => c.id);
  const res = await callClaude(data, {
    system: 'Clasificas movimientos bancarios de España y Latinoamérica en categorías. Usa exclusivamente los ids de categoría dados.',
    messages: [
      {
        role: 'user',
        content: `Categorías:\n${categories.map((c) => `${c.id}: ${c.name} (${c.kind})`).join('\n')}\n\nMovimientos (id, tipo, descripción):\n${items.map((i) => `${i.id}\t${i.amount < 0 ? 'gasto' : 'ingreso'}\t${i.description}`).join('\n')}`,
      },
    ],
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, categoryId: { type: 'string', enum: ids } },
            required: ['id', 'categoryId'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    effort: 'low',
  });
  const parsed = JSON.parse(textOf(res)) as { items: { id: string; categoryId: string }[] };
  const valid = new Set(ids);
  return Object.fromEntries(parsed.items.filter((i) => valid.has(i.categoryId)).map((i) => [i.id, i.categoryId]));
}
