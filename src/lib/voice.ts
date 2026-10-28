import { categorize } from './categorize';
import { callClaude, textOf } from './ai';
import { normalize, today } from './money';
import type { Account, AppData } from './types';

// Registro por voz: "gasté 50 euros en Mercadona" → movimiento.
// Primero un intérprete local (funciona sin conexión); si la IA está
// disponible, completa lo que falte. Lo que siga faltando se pregunta con
// botones de elección rápida.

export interface VoiceDraft {
  kind: 'expense' | 'income';
  amount: number | null;
  currency: string | null;
  description: string;
  categoryId: string | null;
  accountId: string | null;
  date: string;
  /** Campos que hay que confirmar con el usuario. */
  missing: ('amount' | 'category' | 'account')[];
}

const NUMBERS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
};

/** Convierte "cincuenta y cinco" o "dos mil trescientos" en número. */
export function wordsToNumber(text: string): number | null {
  const words = text.split(/\s+/).filter((w) => w && w !== 'y');
  if (!words.length) return null;
  let total = 0;
  let current = 0;
  for (const w of words) {
    if (w === 'mil') {
      total += (current || 1) * 1000;
      current = 0;
    } else if (NUMBERS[w] !== undefined) current += NUMBERS[w];
    else return null;
  }
  return total + current;
}

const CURRENCY_WORDS: [RegExp, string][] = [
  [/\b(euros?|eur|€)/, 'EUR'],
  [/\b(dolares?|dolar|usd|\$|verdes?)/, 'USD'],
  [/\b(bolivares?|bolos?|bs\.?|ves)\b/, 'VES'],
  [/\b(usdt|tether)\b/, 'USDT'],
  [/\b(pesos? colombianos?|cop)\b/, 'COP'],
  [/\b(libras?|gbp)\b/, 'GBP'],
];

const NUM_WORD = Object.keys(NUMBERS).concat(['mil', 'y']).join('|');

function findAccount(data: AppData, text: string, currency: string | null): { id: string | null; ambiguous: Account[] } {
  const usable = data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto' && a.kind !== 'loan');
  if (/\b(efectivo|cash|en mano)\b/.test(text)) {
    const cash = usable.find((a) => a.kind === 'cash' && (!currency || a.currency === currency)) ?? usable.find((a) => a.kind === 'cash');
    if (cash) return { id: cash.id, ambiguous: [] };
  }
  // Nombre de cuenta mencionado ("con la de BBVA", "desde Wise").
  const named = usable.find((a) => {
    const name = normalize(a.name);
    return name.length > 2 && (text.includes(name) || name.split(' ').some((w) => w.length > 3 && text.includes(w)));
  });
  if (named) return { id: named.id, ambiguous: [] };
  if (/\b(tarjeta)\b/.test(text)) {
    const card = usable.find((a) => a.kind === 'card' && (!currency || a.currency === currency));
    if (card) return { id: card.id, ambiguous: [] };
  }
  const candidates = usable.filter((a) => a.kind !== 'cash' && (!currency || a.currency === currency));
  if (candidates.length === 1) return { id: candidates[0].id, ambiguous: [] };
  const counts = new Map<string, number>();
  for (const t of data.transactions.slice(-200)) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1);
  const ranked = [...candidates].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  // Se gasta desde la cuenta corriente: si solo hay una en esa moneda, es esa.
  const checking = candidates.filter((a) => a.kind === 'checking');
  if (currency && checking.length === 1) return { id: checking[0].id, ambiguous: [] };
  // Si una cuenta concentra la gran mayoría de movimientos, es la principal.
  const total = ranked.reduce((s, a) => s + (counts.get(a.id) ?? 0), 0);
  if (currency && ranked[0] && total > 10 && (counts.get(ranked[0].id) ?? 0) / total > 0.8) return { id: ranked[0].id, ambiguous: [] };
  return { id: null, ambiguous: ranked.length ? ranked : usable };
}

/** Intérprete local en español: rápido, sin conexión y sin enviar nada. */
export function parseVoiceLocal(input: string, data: AppData): VoiceDraft {
  const text = normalize(input)
    .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
    // "1.500" dicho en español son mil quinientos, no uno coma cinco.
    .replace(/(\d)\.(\d{3})\b/g, '$1$2');
  const kind: VoiceDraft['kind'] = /\b(ingres[eo]|cobr[eo]|recibi|me (pagaron|ingresaron|transfirieron|enviaron|llego)|gane|nomina|sueldo)\b/.test(text) ? 'income' : 'expense';

  // Importe: dígitos ("50", "12,30", "50 con 30") o palabras ("cincuenta y cinco").
  let amount: number | null = null;
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)(?:\s*con\s*(\d{1,2}))?/);
  if (m) {
    const intPart = Number(m[1].replace(',', '.'));
    amount = Math.round((intPart + (m[2] ? Number(m[2]) / 100 : 0)) * 100);
  } else {
    const w = text.match(new RegExp(`\\b((?:(?:${NUM_WORD})\\s*)+)\\b`));
    const v = w ? wordsToNumber(w[1].trim()) : null;
    if (v) amount = v * 100;
  }

  let currency: string | null = null;
  for (const [re, code] of CURRENCY_WORDS) if (re.test(text)) {
    currency = code;
    break;
  }

  let date = today();
  if (/\banteayer\b/.test(text)) date = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  else if (/\bayer\b/.test(text)) date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Comercio/concepto: lo que va tras "en", "a", "de" o "para", sin la cuenta ni la fecha.
  const rest = text
    .replace(/\b(con|desde|de) (la |mi )?(tarjeta|cuenta|efectivo)\b.*$/, '')
    .replace(/\b(ayer|anteayer|hoy)\b/g, '')
    .trim();
  const d = rest.match(/\b(?:en|a|al|de|del|para|por)\s+(?:el |la |los |las |un |una )?([a-z0-9ñ .'&-]+)$/);
  let description = d ? d[1].trim() : '';
  if (description && /^\d/.test(description)) description = '';
  description = description.replace(/\b(euros?|dolares?|bolivares?|bs)\b/g, '').trim();

  const { categoryId, source } = description ? categorize(description, kind === 'expense' ? -1 : 1, data) : { categoryId: null, source: 'default' as const };
  // Sin moneda dicha, se asume la principal ("pagué 12 en el bar" → euros si vives en España).
  const acc = findAccount(data, text, currency ?? data.settings.currency);
  const accountCurrency = acc.id ? data.accounts.find((a) => a.id === acc.id)?.currency ?? null : null;

  const draft: VoiceDraft = {
    kind,
    amount,
    currency: currency ?? accountCurrency,
    description: description ? description.replace(/\b\w/g, (c) => c.toUpperCase()) : '',
    categoryId: source === 'default' ? null : categoryId,
    accountId: acc.id,
    date,
    missing: [],
  };
  return withMissing(draft);
}

export function withMissing(d: VoiceDraft): VoiceDraft {
  const missing: VoiceDraft['missing'] = [];
  if (!d.amount) missing.push('amount');
  if (!d.categoryId) missing.push('category');
  if (!d.accountId) missing.push('account');
  return { ...d, missing };
}

/** Cuentas que se ofrecen como botones cuando la cuenta no está clara. */
export function accountChoices(data: AppData, currency: string | null): Account[] {
  return findAccount(data, '', currency).ambiguous.slice(0, 6);
}

const VOICE_SCHEMA = (data: AppData) => ({
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['expense', 'income'] },
    amount: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'importe en unidades (no céntimos)' },
    currency: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'código ISO de la moneda mencionada, o null' },
    description: { type: 'string', description: 'comercio o concepto, breve y con mayúscula inicial' },
    categoryId: { anyOf: [{ type: 'string', enum: data.categories.map((c) => c.id) }, { type: 'null' }] },
    accountId: { anyOf: [{ type: 'string', enum: data.accounts.map((a) => a.id) }, { type: 'null' }] },
    date: { type: 'string', description: 'YYYY-MM-DD' },
  },
  required: ['kind', 'amount', 'currency', 'description', 'categoryId', 'accountId', 'date'],
  additionalProperties: false,
});

/** Interpretación con IA para frases más libres. Completa lo que el intérprete local no supo. */
export async function parseVoiceAI(input: string, data: AppData, local: VoiceDraft): Promise<VoiceDraft> {
  const accounts = data.accounts.filter((a) => a.kind !== 'investment').map((a) => `${a.id}: ${a.name} (${a.kind}, ${a.currency})`).join('\n');
  const cats = data.categories.map((c) => `${c.id}: ${c.name} (${c.kind})`).join('\n');
  const res = await callClaude(data, {
    system: `Conviertes frases dichas en voz alta en un movimiento financiero. Hoy es ${today()}. Si un dato no se menciona y no se puede deducir con seguridad, usa null (para la cuenta, null salvo que la mencionen o solo haya una cuenta en esa moneda).`,
    messages: [{ role: 'user', content: `Cuentas:\n${accounts}\n\nCategorías:\n${cats}\n\nFrase: "${input}"` }],
    schema: VOICE_SCHEMA(data),
    effort: 'low',
    maxTokens: 2000,
  });
  const ai = JSON.parse(textOf(res)) as Omit<VoiceDraft, 'missing' | 'amount'> & { amount: number | null };
  return withMissing({
    kind: ai.kind ?? local.kind,
    amount: local.amount ?? (ai.amount ? Math.round(ai.amount * 100) : null),
    currency: local.currency ?? ai.currency,
    description: ai.description || local.description,
    categoryId: local.categoryId ?? ai.categoryId,
    accountId: local.accountId ?? ai.accountId,
    date: ai.date || local.date,
    missing: [],
  });
}

// ---------- Reconocimiento de voz del navegador ----------

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Escucha una frase y devuelve el texto (parcial mientras habla, final al terminar). */
export function listen(onText: (text: string, final: boolean) => void, onError: (msg: string) => void): () => void {
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onError('Tu navegador no permite dictado. Escribe la frase.');
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = 'es-ES';
  rec.interimResults = true;
  rec.continuous = false;
  let finalSent = false;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = e.results[i].isFinal;
    }
    if (final) finalSent = true;
    onText(text, final);
  };
  rec.onerror = (e) =>
    onError(e.error === 'not-allowed' ? 'Permite el acceso al micrófono para dictar.' : e.error === 'no-speech' ? 'No te he oído. Prueba otra vez.' : `Error de dictado: ${e.error}`);
  rec.onend = () => {
    if (!finalSent) onText('', true);
  };
  rec.start();
  return () => rec.stop();
}
