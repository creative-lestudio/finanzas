import type Anthropic from '@anthropic-ai/sdk';
import { budgetStatus } from './budgets';
import { fxSummary, toBase } from './fx';
import { goalProgress } from './goals';
import { healthReport, netWorth } from './health';
import { detectSubscriptions, isActive, monthSummary } from './insights';
import { addMonths, today } from './money';
import { getSample, hasClaudeHost, IS_PREVIEW, sampleError, type SampleTool } from './preview';
import { getSupabaseConfig, supabase } from './sync';
import type { AppData } from './types';

// Acceso a Claude. Dos modos:
//  - 'server': a través de la función `ai` de Supabase, con la clave del
//    servicio (requiere haber iniciado sesión). Es el modo para usuarios finales.
//  - 'own': el usuario pega su propia clave de API y se llama desde el navegador.
// En ambos casos se envía un resumen de tus finanzas, nunca IBAN ni credenciales.

export const MODEL = 'claude-opus-5-5';

export interface ClaudeRequest {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools?: Anthropic.Beta.BetaTool[];
  /** Esquema JSON para respuestas estructuradas. */
  schema?: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

export class AIUnavailable extends Error {}

export function aiAvailability(data: AppData): { ok: boolean; reason?: string } {
  if (data.settings.offlineOnly) return { ok: false, reason: 'El modo sin terceros está activado.' };
  if (IS_PREVIEW) return hasClaudeHost() ? { ok: true } : { ok: false, reason: 'Abre la vista previa en claude.ai para usar la IA.' };
  const mode = data.settings.aiMode ?? 'server';
  if (mode === 'own') return data.settings.anthropicApiKey ? { ok: true } : { ok: false, reason: 'Falta tu clave de API de Anthropic.' };
  return getSupabaseConfig() ? { ok: true } : { ok: false, reason: 'El servicio de IA no está configurado.' };
}

export async function callClaude(data: AppData, req: ClaudeRequest): Promise<Anthropic.Beta.BetaMessage> {
  const avail = aiAvailability(data);
  if (!avail.ok) throw new AIUnavailable(avail.reason);
  const mode = data.settings.aiMode ?? 'server';

  if (IS_PREVIEW) return previewCall(req);

  let message: Anthropic.Beta.BetaMessage;
  if (mode === 'own') {
    // El SDK solo se descarga cuando se usa la IA con clave propia.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: data.settings.anthropicApiKey!, dangerouslyAllowBrowser: true });
    message = await client.beta.messages.create({
      model: MODEL,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: req.messages,
      tools: req.tools,
      output_config: { effort: req.effort ?? 'medium', ...(req.schema ? { format: { type: 'json_schema', schema: req.schema } } : {}) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } else {
    const sb = supabase();
    const { data: s } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    if (!sb || !s.session) throw new AIUnavailable('Inicia sesión (Ajustes → Cuenta) para usar el asistente.');
    const { data: res, error } = await sb.functions.invoke<Anthropic.Beta.BetaMessage>('ai', {
      body: { system: req.system, messages: req.messages, tools: req.tools, schema: req.schema, effort: req.effort, maxTokens: req.maxTokens },
    });
    if (error) {
      let msg = error.message;
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) msg = body.error;
      } catch {
        /* sin cuerpo */
      }
      throw new Error(msg);
    }
    message = res!;
  }
  if (message.stop_reason === 'refusal') throw new Error('La IA no ha podido responder a esta petición.');
  return message;
}

const flatten = (req: ClaudeRequest): string =>
  [
    req.system,
    ...req.messages.map((m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((b) => ('text' in b ? b.text : '')).join('\n'))),
  ].join('\n\n');

/** Vista previa: misma interfaz que la API, servida por la cuenta de Claude del visitante. */
async function previewCall(req: ClaudeRequest): Promise<Anthropic.Beta.BetaMessage> {
  const sample = await getSample();
  if (!sample) throw new AIUnavailable('La IA no está disponible en esta vista.');
  try {
    const text = req.schema
      ? JSON.stringify(await sample.json(`${flatten(req)}\n\nResponde solo con un JSON que cumpla este esquema:\n${JSON.stringify(req.schema)}`, { modelTier: 'quick' }))
      : (await sample(flatten(req), { cache: false })).text;
    return { content: [{ type: 'text', text, citations: null }], stop_reason: 'end_turn' } as unknown as Anthropic.Beta.BetaMessage;
  } catch (e) {
    throw sampleError(e);
  }
}

export const textOf = (m: Anthropic.Beta.BetaMessage) =>
  m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();

// ---------- Resumen financiero para el asesor ----------

const n = (cents: number) => Math.round(cents) / 100;

/** Foto compacta de tus finanzas (en moneda principal) para dar contexto al asesor. */
export function financialSnapshot(data: AppData): Record<string, unknown> {
  const now = today();
  const month = now.slice(0, 7);
  const day = Number(now.slice(8));
  const cat = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;
  const months = [5, 4, 3, 2, 1, 0].map((i) => {
    const m = monthSummary(data, addMonths(month, -i));
    const top = Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { mes: m.month, ingresos: n(m.income), gastos: n(m.expenses), porCategoria: Object.fromEntries(top.map(([k, v]) => [cat(k), n(v)])), parcial: i === 0 };
  });
  const nw = netWorth(data);
  const health = healthReport(data, month, day);
  const fx = fxSummary(data, addMonths(month, -6));
  return {
    fecha: now,
    monedaPrincipal: data.settings.currency,
    patrimonio: { neto: n(nw.net), activos: n(nw.assets), deudas: n(nw.liabilities), liquidez: n(nw.liquid) },
    cuentas: data.accounts.map((a) => ({ nombre: a.name, tipo: a.kind, moneda: a.currency, saldo: n(a.balance), saldoEnPrincipal: n(toBase(data, a.balance, a.currency, now)) })),
    meses: months,
    presupuestos: budgetStatus(data, month, day).map((b) => ({ categoria: cat(b.budget.categoryId), categoriaId: b.budget.categoryId, tope: n(b.limit), gastado: n(b.spent), estado: b.state })),
    metas: data.goals.map((g) => {
      const p = goalProgress(data, g);
      return { nombre: g.name, tipo: g.kind ?? 'savings', moneda: p.currency, objetivo: n(g.target), actual: n(p.current), fechaLimite: g.deadline, necesarioAlMes: p.requiredMonthly === null ? null : n(p.requiredMonthly), aportacionMediaReal: n(p.actualMonthly), estado: p.status };
    }),
    suscripciones: detectSubscriptions(data).filter((s) => isActive(s, now)).map((s) => ({ nombre: s.name, tipo: s.kind, frecuencia: s.frequency, anualEnPrincipal: n(s.yearlyBase) })),
    salud: { puntuacion: health.score, nivel: health.grade, factores: health.factors.map((f) => ({ factor: f.label, valor: f.value, puntos: f.score })) },
    divisas: {
      perdidaGananciaTotal6m: n(fx.total),
      comisiones6m: n(fx.fees),
      porPlataforma: fx.byPlatform.map((p) => ({ plataforma: p.platform, operaciones: p.count, diferenciaMediaPct: Math.round(p.avgPct * 1000) / 10 })),
      ingresosATasaOficial: fx.incomes.slice(0, 6).map((i) => ({ fecha: i.transaction.date, nominal: `${n(i.nominal)} ${i.nominalCurrency}`, recibido: `${n(i.received)} ${i.receivedCurrency}`, tasaPagada: i.paidRate, tasaMercado: i.marketRate, diferencia: i.diff === null ? null : `${n(i.diff)} ${i.nominalCurrency}` })),
    },
    categoriasDisponibles: data.categories.filter((c) => c.kind === 'expense').map((c) => ({ id: c.id, nombre: c.name })),
  };
}

export const ADVISOR_SYSTEM = `Eres el asesor financiero personal integrado en la app "Finanzas". Hablas en español, de tú, con un tono cercano y directo.

Recibirás una foto de las finanzas del usuario en JSON (importes en su moneda principal salvo que se indique otra). Úsala para:
- Analizar ingresos, gastos, tendencias y fugas con cifras concretas.
- Proponer presupuestos realistas por categoría a partir de su gasto real e ingresos (p. ej. regla 50/30/20 adaptada a su caso).
- Plantear metas de ahorro o inversión medibles (cifra, fecha, aportación mensual).
- Ayudar a decidir (¿me lo puedo permitir?, ¿qué deuda pago primero?, ¿dónde cambio mis divisas?).
- Si tiene ingresos en bolívares u otras monedas, tener en cuenta la diferencia entre tasa oficial (BCV) y de mercado, y las comisiones de plataformas como Wise o Binance P2P.

Cuando propongas presupuestos o metas concretos, usa las herramientas propose_budgets o propose_goal: el usuario verá un botón para aplicarlos. No digas que ya están aplicados.

Sé breve: respuestas de pocas frases o listas cortas, con los números clave en negrita. Si faltan datos para responder bien, pregunta. No inventes datos que no estén en la foto. Recuerda de vez en cuando, sin repetirlo en cada respuesta, que es orientación general y no asesoramiento financiero regulado.`;

export const ADVISOR_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'propose_budgets',
    description: 'Propone al usuario topes de presupuesto mensuales por categoría. El usuario decide si aplicarlos.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        budgets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              categoryId: { type: 'string', description: 'id de una categoría de gasto existente' },
              limit: { type: 'number', description: 'tope mensual en la moneda principal (unidades, no céntimos)' },
              reason: { type: 'string' },
            },
            required: ['categoryId', 'limit', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['budgets'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_goal',
    description: 'Propone al usuario una meta medible de ahorro, inversión, compra o pago de deuda. El usuario decide si crearla.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        kind: { type: 'string', enum: ['savings', 'investment', 'debt', 'purchase'] },
        target: { type: 'number', description: 'cifra objetivo en unidades de `currency`' },
        currency: { type: 'string', description: 'código ISO, p. ej. EUR, USD' },
        deadline: { type: 'string', description: 'fecha límite YYYY-MM-DD' },
        monthlyPlan: { type: 'number', description: 'aportación mensual sugerida' },
        expectedReturn: { type: 'number', description: 'rentabilidad anual esperada en %, 0 si no aplica' },
        reason: { type: 'string' },
      },
      required: ['name', 'kind', 'target', 'currency', 'deadline', 'monthlyPlan', 'expectedReturn', 'reason'],
      additionalProperties: false,
    },
  },
];

export type Proposal =
  | { type: 'budgets'; budgets: { categoryId: string; limit: number; reason: string }[] }
  | { type: 'goal'; goal: { name: string; kind: 'savings' | 'investment' | 'debt' | 'purchase'; target: number; currency: string; deadline: string; monthlyPlan: number; expectedReturn: number; reason: string } };

export interface AdvisorTurn {
  messages: Anthropic.Beta.BetaMessageParam[];
  text: string;
  proposals: Proposal[];
}

/**
 * Un turno del asesor. Las herramientas no ejecutan nada: devuelven
 * propuestas que la interfaz muestra con un botón "Aplicar".
 */
export async function advisorTurn(data: AppData, history: Anthropic.Beta.BetaMessageParam[], userText: string): Promise<AdvisorTurn> {
  if (IS_PREVIEW) return previewAdvisorTurn(data, history, userText);
  const snapshot = JSON.stringify(financialSnapshot(data));
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: 'user', content: history.length ? userText : `<finanzas>${snapshot}</finanzas>\n\n${userText}` },
  ];
  const proposals: Proposal[] = [];
  const texts: string[] = [];
  for (let i = 0; i < 4; i++) {
    const res = await callClaude(data, { system: ADVISOR_SYSTEM, messages, tools: ADVISOR_TOOLS, effort: 'medium' });
    messages.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const t = textOf(res);
    if (t) texts.push(t);
    if (res.stop_reason !== 'tool_use') break;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const input = block.input as Record<string, unknown>;
      if (block.name === 'propose_budgets') proposals.push({ type: 'budgets', budgets: (input.budgets as Extract<Proposal, { type: 'budgets' }>['budgets']) ?? [] });
      else if (block.name === 'propose_goal') proposals.push({ type: 'goal', goal: input as Extract<Proposal, { type: 'goal' }>['goal'] });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Propuesta mostrada al usuario con un botón para aplicarla. Aún no está aplicada.' });
    }
    messages.push({ role: 'user', content: results });
  }
  return { messages, text: texts.join('\n\n'), proposals };
}

/** Asesor en la vista previa: las herramientas de propuesta se ejecutan en la página. */
async function previewAdvisorTurn(data: AppData, history: Anthropic.Beta.BetaMessageParam[], userText: string): Promise<AdvisorTurn> {
  const sample = await getSample();
  if (!sample) throw new AIUnavailable('La IA no está disponible en esta vista.');
  const proposals: Proposal[] = [];
  const tools: SampleTool[] = ADVISOR_TOOLS.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    inputSchema: t.input_schema as Record<string, unknown>,
    execute: (input) => {
      if (t.name === 'propose_budgets') proposals.push({ type: 'budgets', budgets: (input.budgets as Extract<Proposal, { type: 'budgets' }>['budgets']) ?? [] });
      else proposals.push({ type: 'goal', goal: input as Extract<Proposal, { type: 'goal' }>['goal'] });
      return 'Propuesta mostrada al usuario con un botón para aplicarla. Aún no está aplicada.';
    },
  }));
  const turns = history.map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content) }));
  const first = turns.length === 0;
  const content = first ? `${ADVISOR_SYSTEM}\n\n<finanzas>${JSON.stringify(financialSnapshot(data))}</finanzas>\n\n${userText}` : userText;
  const next = [...turns, { role: 'user' as const, content }];
  try {
    const { text } = await sample(next, { tools });
    const messages: Anthropic.Beta.BetaMessageParam[] = [...next, { role: 'assistant', content: text }];
    return { messages, text, proposals };
  } catch (e) {
    throw sampleError(e);
  }
}
