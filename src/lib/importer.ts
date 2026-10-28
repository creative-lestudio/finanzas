import { categorize, detectChannel } from './categorize';
import { normalize, parseAmount, uid } from './money';
import type { AppData, Transaction } from './types';

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
