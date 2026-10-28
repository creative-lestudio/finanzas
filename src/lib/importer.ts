import { categorize, detectChannel } from './categorize';
import { normalize, parseAmount, uid } from './money';
import { recordExchange } from './fx';
import type { Account, AppData, Transaction } from './types';

export interface RawMovement {
  date: string;
  amount: number;
  description: string;
  externalId?: string;
}

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** Acepta dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd y dd.mm.aaaa. */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const COLS = {
  date: ['fecha operacion', 'fecha', 'f. operacion', 'fecha valor', 'date', 'booking date'],
  desc: ['concepto', 'descripcion', 'movimiento', 'detalle', 'description', 'concept', 'comercio'],
  amount: ['importe', 'cantidad', 'amount', 'importe (eur)', 'importe eur'],
  debit: ['cargo', 'debe', 'cargos', 'debit'],
  credit: ['abono', 'haber', 'abonos', 'credit'],
};

function findCol(header: string[], names: string[]): number {
  for (const n of names) {
    const i = header.findIndex((h) => h === n || h.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * Importa el CSV/TSV que exportan la mayoría de bancos españoles. Busca la
 * fila de cabecera (los bancos suelen añadir líneas de resumen antes) y
 * detecta separador, columnas y formato numérico.
 */
export function parseBankCSV(text: string): { movements: RawMovement[]; errors: number } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 20).join('\n');
  const sep = [';', '\t', ','].map((s) => [s, sample.split(s).length - 1] as const).sort((a, b) => b[1] - a[1])[0][0];
  const { movements, errors } = parseRows(lines.map((l) => splitLine(l, sep)));
  return { movements, errors };
}

/**
 * Interpreta una tabla (filas de celdas de texto) venga de CSV o de Excel.
 * `extraCols` devuelve además esas columnas opcionales por fila (cuenta, moneda...).
 */
export function parseRows(
  rows: string[][],
  extraCols: string[] = [],
): { movements: RawMovement[]; errors: number; extra: Record<string, string>[] } {
  let headerIdx = -1;
  let header: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const h = rows[i].map((c) => normalize(c.replace(/"/g, '')));
    if (findCol(h, COLS.date) >= 0 && (findCol(h, COLS.amount) >= 0 || findCol(h, COLS.debit) >= 0)) {
      headerIdx = i;
      header = h;
      break;
    }
  }
  if (headerIdx < 0) return { movements: [], errors: rows.length, extra: [] };

  const iDate = findCol(header, COLS.date);
  const iDesc = findCol(header, COLS.desc);
  const iAmount = findCol(header, COLS.amount);
  const iDebit = findCol(header, COLS.debit);
  const iCredit = findCol(header, COLS.credit);
  const iExtra = extraCols.map((c) => [c, header.findIndex((h) => h === c)] as const);

  const movements: RawMovement[] = [];
  const extra: Record<string, string>[] = [];
  let errors = 0;
  for (const cells of rows.slice(headerIdx + 1)) {
    const date = parseDate(cells[iDate] ?? '');
    let amount: number | null = null;
    if (iAmount >= 0) amount = parseAmount(cells[iAmount] ?? '');
    else {
      const d = parseAmount(cells[iDebit] ?? '') ?? 0;
      const c = iCredit >= 0 ? parseAmount(cells[iCredit] ?? '') ?? 0 : 0;
      amount = c - Math.abs(d);
    }
    if (!date || amount === null || amount === 0) {
      errors++;
      continue;
    }
    const description = (iDesc >= 0 ? cells[iDesc] : cells.filter((_, i) => i !== iDate && i !== iAmount).join(' ')) || 'Movimiento';
    movements.push({ date, amount, description });
    extra.push(Object.fromEntries(iExtra.filter(([, i]) => i >= 0 && cells[i]).map(([c, i]) => [c, cells[i]])));
  }
  return { movements, errors, extra };
}

function fingerprintOf(m: RawMovement, n: number): string {
  return m.externalId ?? `${m.date}|${m.amount}|${normalize(m.description)}|${n}`;
}

/**
 * Añade movimientos a una cuenta evitando duplicados (por id externo o por
 * fecha+importe+concepto) y los categoriza automáticamente.
 */
export function mergeMovements(
  data: AppData,
  accountId: string,
  movements: RawMovement[],
): { data: AppData; added: Transaction[]; duplicates: number } {
  const existing = new Set(data.transactions.filter((t) => t.accountId === accountId).map((t) => t.fingerprint));
  const seen = new Map<string, number>();
  const added: Transaction[] = [];
  let duplicates = 0;
  for (const m of movements) {
    const base = `${m.date}|${m.amount}|${normalize(m.description)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const fingerprint = fingerprintOf(m, n);
    if (existing.has(fingerprint)) {
      duplicates++;
      continue;
    }
    const { categoryId, source } = categorize(m.description, m.amount, data);
    added.push({
      id: uid(),
      accountId,
      date: m.date,
      amount: m.amount,
      description: m.description,
      categoryId,
      categorySource: source,
      channel: detectChannel(m.description),
      fingerprint,
    });
  }
  // El saldo de las cuentas sincronizadas lo marca el banco; en las demás se acumula.
  const delta = added.reduce((s, t) => s + t.amount, 0);
  const accounts = data.accounts.map((a) => (a.id === accountId ? { ...a, balance: a.balance + delta } : a));
  return { data: { ...data, accounts, transactions: [...data.transactions, ...added] }, added, duplicates };
}

// ---------- Hoja propia: Fecha, Tipo, Cuenta, Moneda, Categoría, Descripción, Monto… ----------

export interface LedgerRow {
  date: string;
  type: 'expense' | 'income' | 'exchange';
  account: string;
  currency: string;
  category: string;
  description: string;
  amount: number;
  destAccount?: string;
  destAmount?: number;
  via?: string;
  debt?: string;
  belongsTo?: string;
}

/** Trocea un CSV/TSV en filas de celdas (detecta el separador). */
export function csvRows(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 20).join('\n');
  const sep = [';', '\t', ','].map((s) => [s, sample.split(s).length - 1] as const).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((l) => splitLine(l, sep));
}

const TYPE_MAP: Record<string, LedgerRow['type']> = {
  gasto: 'expense', egreso: 'expense', salida: 'expense', expense: 'expense',
  ingreso: 'income', entrada: 'income', income: 'income',
  cambio: 'exchange', conversion: 'exchange', transferencia: 'exchange', exchange: 'exchange',
};

/**
 * Reconoce una hoja con columnas Tipo + Cuenta + Moneda + Monto (los montos van
 * sin signo y el tipo dice si es gasto, ingreso o cambio de divisa).
 * Devuelve null si el archivo no tiene ese formato.
 */
export function parseLedger(rows: string[][]): { rows: LedgerRow[]; errors: number } | null {
  const hi = rows.findIndex((r) => {
    const h = r.map((c) => normalize(c));
    return h.includes('tipo') && h.includes('cuenta') && (h.includes('monto') || h.includes('importe')) && h.some((x) => x.startsWith('fecha'));
  });
  if (hi < 0) return null;
  const h = rows[hi].map((c) => normalize(c));
  const col = (...names: string[]) => h.findIndex((x) => names.some((n) => x === n || x.startsWith(n)));
  const c = {
    date: col('fecha'), type: col('tipo'), account: col('cuenta'), currency: col('moneda'), category: col('categoria'),
    desc: col('descripcion', 'concepto'), amount: col('monto', 'importe'), dest: col('cuenta destino'), destAmount: col('monto destino'),
    via: col('via', 'plataforma'), debt: col('deuda'), belongs: col('corresponde'),
  };
  const out: LedgerRow[] = [];
  let errors = 0;
  for (const r of rows.slice(hi + 1)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const date = parseDate(get(c.date));
    const type = TYPE_MAP[normalize(get(c.type))];
    const amount = parseAmount(get(c.amount));
    if (!date || !type || amount === null || amount === 0 || !get(c.account)) {
      errors++;
      continue;
    }
    const destAmount = parseAmount(get(c.destAmount));
    if (type === 'exchange' && (!get(c.dest) || !destAmount)) {
      errors++;
      continue;
    }
    out.push({
      date, type, account: get(c.account), currency: get(c.currency).toUpperCase(), category: get(c.category),
      description: get(c.desc) || 'Movimiento', amount: Math.abs(amount),
      destAccount: get(c.dest) || undefined, destAmount: destAmount ? Math.abs(destAmount) : undefined,
      via: get(c.via) || undefined, debt: get(c.debt) || undefined, belongsTo: get(c.belongs) || undefined,
    });
  }
  return { rows: out, errors };
}

const CATEGORY_ALIAS: Record<string, string> = {
  'alimentacion/mercado': 'groceries', alimentacion: 'groceries', mercado: 'groceries', supermercado: 'groceries',
  restaurantes: 'restaurants', transporte: 'transport', combustible: 'fuel', suscripciones: 'subscriptions',
  salud: 'health', ocio: 'leisure', 'alquiler vivienda': 'home', hogar: 'home', otros: 'other', 'ingreso extra': 'other_income',
  'ingreso trabajo': 'freelance', nomina: 'salary', comisiones: 'fees', impuestos: 'taxes', viajes: 'travel',
};
const EMOJI: Record<string, string> = { 'legacy world': '🏢', personal: '🧴', 'gasto de trabajo': '💼', deudas: '💳' };

export interface LedgerOptions {
  /** Monedas a sustituir al importar (p. ej. { BS: 'USD' } si los montos son dólares equivalentes). */
  currencyMap?: Record<string, string>;
}

export interface LedgerResult {
  data: AppData;
  transactions: number;
  exchanges: number;
  duplicates: number;
  newAccounts: string[];
  newCategories: string[];
}

const slug = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CURRENCY_ALIAS: Record<string, string> = { BS: 'VES', 'BS.': 'VES', BSF: 'VES', BOLIVARES: 'VES', DOLARES: 'USD', EUROS: 'EUR', '$': 'USD', '€': 'EUR' };

/** Aplica las filas a los datos: crea cuentas y categorías que falten, evita duplicados y registra los cambios de divisa. */
export function applyLedger(data: AppData, rows: LedgerRow[], opts: LedgerOptions = {}): LedgerResult {
  let next: AppData = { ...data, accounts: [...data.accounts], categories: [...data.categories], transactions: [...data.transactions], exchanges: [...data.exchanges] };
  const newAccounts: string[] = [];
  const newCategories: string[] = [];
  const cur = (c: string) => {
    const up = c.toUpperCase();
    const mapped = opts.currencyMap?.[up] ?? CURRENCY_ALIAS[up] ?? up;
    return mapped || data.settings.currency;
  };

  const accountId = (name: string, currency: string) => {
    const same = next.accounts.filter((a) => normalize(a.name) === normalize(name));
    const found = same.find((a) => a.currency === currency) ?? (same.length === 1 && !currency ? same[0] : undefined);
    if (found) return found.id;
    const n = normalize(name);
    const kind: Account['kind'] = n.includes('efectivo') || n === 'cash' ? 'cash' : n.includes('binance') ? 'crypto' : 'checking';
    const id = uid();
    next.accounts.push({ id, name, kind, balance: 0, currency, source: 'import' });
    newAccounts.push(`${name} (${currency})`);
    return id;
  };

  const categoryId = (name: string, kind: 'expense' | 'income'): string => {
    const n = normalize(name);
    if (!n || n === 'por revisar') return kind === 'income' ? 'other_income' : 'other';
    const alias = CATEGORY_ALIAS[n];
    if (alias) {
      const target = next.categories.find((x) => x.id === alias);
      if (target && (target.kind === kind || target.kind === 'transfer')) return alias;
      if (target && target.kind !== kind) return kind === 'income' ? 'other_income' : 'other';
    }
    const exact = next.categories.find((x) => normalize(x.name) === n && x.kind === kind);
    if (exact) return exact.id;
    // Un nombre usado como gasto y como ingreso (p. ej. "Legacy World") genera dos categorías.
    const label = kind === 'income' && next.categories.some((x) => normalize(x.name) === n && x.kind === 'expense') ? `${name} (ingresos)` : name;
    const id = `c-${slug(label)}${kind === 'income' ? '-in' : ''}`;
    if (!next.categories.some((x) => x.id === id)) {
      next.categories.push({ id, name: label, icon: EMOJI[n] ?? '•', kind });
      newCategories.push(label);
    }
    return id;
  };

  // La moneda de la cuenta destino de un cambio se deduce de los demás movimientos de esa cuenta.
  const knownCurrency = new Map<string, string>();
  for (const a of data.accounts) knownCurrency.set(normalize(a.name), a.currency);
  for (const r of rows) if (r.currency) knownCurrency.set(normalize(r.account), cur(r.currency));
  const seen = new Map<string, number>();
  let transactions = 0;
  let exchanges = 0;
  let duplicates = 0;
  const existing = new Set(data.transactions.map((t) => `${t.accountId}|${t.date}|${t.amount}|${normalize(t.description)}`));

  for (const r of rows) {
    const currency = cur(r.currency);
    const from = accountId(r.account, currency);
    if (r.type === 'exchange') {
      const to = accountId(r.destAccount!, knownCurrency.get(normalize(r.destAccount!)) ?? data.settings.currency);
      const sent = r.amount;
      const got = r.destAmount!;
      if (next.exchanges.some((e) => e.date === r.date && e.fromAccountId === from && e.toAccountId === to && e.fromAmount === sent && e.toAmount === got)) {
        duplicates++;
        continue;
      }
      next = recordExchange(next, { date: r.date, fromAccountId: from, fromAmount: sent, toAccountId: to, toAmount: got, fee: 0, platform: r.via || 'Cambio', note: r.description });
      exchanges++;
      continue;
    }
    const amount = r.amount * (r.type === 'expense' ? -1 : 1);
    const base = `${from}|${r.date}|${amount}|${normalize(r.description)}`;
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    if (k === 0 && existing.has(base)) {
      duplicates++;
      continue;
    }
    const notes = [r.debt ? `Deuda: ${r.debt}` : '', r.belongsTo ? `Corresponde a ${r.belongsTo}` : ''].filter(Boolean).join(' · ');
    const account = next.accounts.find((a) => a.id === from)!;
    next.transactions.push({
      id: uid(), accountId: from, date: r.date, amount, description: r.description,
      categoryId: categoryId(r.category, r.type === 'expense' ? 'expense' : 'income'), categorySource: 'user',
      channel: account.kind === 'cash' ? 'cash' : detectChannel(r.description),
      note: notes || undefined,
    });
    next.accounts = next.accounts.map((a) => (a.id === from ? { ...a, balance: a.balance + amount } : a));
    transactions++;
  }
  return { data: next, transactions, exchanges, duplicates, newAccounts, newCategories };
}
