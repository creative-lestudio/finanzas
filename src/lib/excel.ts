import { accountCurrency, analyzeExchange } from './fx';
import { goalProgress } from './goals';
import { categorize, detectChannel } from './categorize';
import { normalize, uid } from './money';
import { parseRows, type RawMovement } from './importer';
import type { AppData, Transaction } from './types';

// Importación y exportación en Excel (.xlsx). ExcelJS se carga bajo demanda
// para no engordar la app: solo se descarga al usar esta función.

const loadExcel = async () => (await import('exceljs')).default;

const euros = (cents: number) => Math.round(cents) / 100;

/** Genera un libro con todas tus finanzas: movimientos, cuentas, presupuestos, metas y cambios. */
export async function exportWorkbook(data: AppData): Promise<Blob> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Finanzas';
  wb.created = new Date();
  const cat = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;
  const acc = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? id;

  const header = (ws: import('exceljs').Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };

  const tx = wb.addWorksheet('Movimientos');
  tx.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Concepto', key: 'description', width: 40 },
    { header: 'Importe', key: 'amount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Moneda', key: 'currency', width: 8 },
    { header: 'Cuenta', key: 'account', width: 20 },
    { header: 'Categoría', key: 'category', width: 20 },
    { header: 'Importe nominal', key: 'fxAmount', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Moneda nominal', key: 'fxCurrency', width: 10 },
    { header: 'Tasa', key: 'fxRate', width: 10 },
    { header: 'Fuente tasa', key: 'fxSource', width: 12 },
    { header: 'Nota', key: 'note', width: 30 },
  ];
  for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    tx.addRow({
      date: t.date,
      description: t.description,
      amount: euros(t.amount),
      currency: accountCurrency(data, t.accountId),
      account: acc(t.accountId),
      category: cat(t.categoryId),
      fxAmount: t.fx ? euros(t.fx.amount) : null,
      fxCurrency: t.fx?.currency ?? null,
      fxRate: t.fx?.rate ?? null,
      fxSource: t.fx?.source ?? null,
      note: t.note ?? null,
    });
  }
  header(tx);

  const accounts = wb.addWorksheet('Cuentas');
  accounts.columns = [
    { header: 'Nombre', key: 'name', width: 24 },
    { header: 'Tipo', key: 'kind', width: 12 },
    { header: 'Moneda', key: 'currency', width: 8 },
    { header: 'Saldo', key: 'balance', width: 14, style: { numFmt: '#,##0.00' } },
  ];
  for (const a of data.accounts) accounts.addRow({ name: a.name, kind: a.kind, currency: a.currency, balance: euros(a.balance) });
  header(accounts);

  const budgets = wb.addWorksheet('Presupuestos');
  budgets.columns = [
    { header: 'Categoría', key: 'category', width: 22 },
    { header: 'Tope mensual', key: 'limit', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Aviso al %', key: 'warn', width: 10 },
  ];
  for (const b of data.budgets) budgets.addRow({ category: cat(b.categoryId), limit: euros(b.limit), warn: Math.round(b.warnAt * 100) });
  header(budgets);

  const goals = wb.addWorksheet('Metas');
  goals.columns = [
    { header: 'Meta', key: 'name', width: 24 },
    { header: 'Tipo', key: 'kind', width: 12 },
    { header: 'Moneda', key: 'currency', width: 8 },
    { header: 'Objetivo', key: 'target', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Actual', key: 'current', width: 14, style: { numFmt: '#,##0.00' } },
    { header: '% logrado', key: 'pct', width: 10 },
    { header: 'Fecha límite', key: 'deadline', width: 12 },
    { header: 'Necesario al mes', key: 'required', width: 16, style: { numFmt: '#,##0.00' } },
  ];
  for (const g of data.goals) {
    const p = goalProgress(data, g);
    goals.addRow({ name: g.name, kind: g.kind ?? 'savings', currency: p.currency, target: euros(g.target), current: euros(p.current), pct: Math.round(p.ratio * 100), deadline: g.deadline ?? null, required: p.requiredMonthly === null ? null : euros(p.requiredMonthly) });
  }
  header(goals);

  const fx = wb.addWorksheet('Cambios de divisa');
  fx.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Plataforma', key: 'platform', width: 16 },
    { header: 'Sale', key: 'from', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Moneda', key: 'fromCur', width: 8 },
    { header: 'Llega', key: 'to', width: 14, style: { numFmt: '#,##0.00' } },
    { header: 'Moneda ', key: 'toCur', width: 8 },
    { header: 'Comisión', key: 'fee', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'Tasa obtenida', key: 'eff', width: 14 },
    { header: 'Tasa referencia', key: 'ref', width: 14 },
    { header: 'Diferencia (destino)', key: 'diff', width: 18, style: { numFmt: '#,##0.00' } },
    { header: 'Diferencia %', key: 'pct', width: 12, style: { numFmt: '0.00%' } },
  ];
  for (const e of data.exchanges) {
    const a = analyzeExchange(data, e);
    fx.addRow({ date: e.date, platform: e.platform, from: euros(e.fromAmount), fromCur: a.from, to: euros(e.toAmount), toCur: a.to, fee: euros(e.fee), eff: a.effectiveRate, ref: a.referenceRate, diff: a.diff === null ? null : euros(a.diff), pct: a.diffPct });
  }
  header(fx);

  const rates = wb.addWorksheet('Tasas');
  rates.columns = [
    { header: 'Fecha', key: 'date', width: 12 },
    { header: 'Base', key: 'base', width: 8 },
    { header: 'Cotizada', key: 'quote', width: 8 },
    { header: 'Tasa', key: 'rate', width: 14 },
    { header: 'Fuente', key: 'source', width: 14 },
  ];
  for (const r of data.rates) rates.addRow(r);
  header(rates);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.result !== undefined) return cellText(o.result);
    if (o.text) return o.text;
  }
  return String(v);
};

export interface ExcelImport {
  movements: (RawMovement & { account?: string; category?: string; currency?: string })[];
  errors: number;
  sheet: string;
}

/**
 * Lee un .xlsx: el exportado por esta app (hoja "Movimientos") o el extracto
 * de cualquier banco (primera hoja con columnas de fecha, concepto e importe).
 */
export async function readWorkbook(file: ArrayBuffer): Promise<ExcelImport> {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);
  const ws = wb.getWorksheet('Movimientos') ?? wb.worksheets[0];
  if (!ws) return { movements: [], errors: 0, sheet: '' };
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1);
    rows.push(values.map(cellText));
  });
  const { movements, errors, extra } = parseRows(rows, ['cuenta', 'categoria', 'moneda']);
  return {
    movements: movements.map((m, i) => ({ ...m, account: extra[i]?.cuenta, category: extra[i]?.categoria, currency: extra[i]?.moneda })),
    errors,
    sheet: ws.name,
  };
}

/**
 * Añade lo importado: respeta la cuenta y la categoría de cada fila si
 * existen (creando cuentas nuevas por nombre) y evita duplicados.
 */
export function applyExcelImport(data: AppData, imp: ExcelImport, defaultAccountId: string): { data: AppData; added: number; duplicates: number } {
  let next = { ...data, accounts: [...data.accounts] };
  const accountId = (name?: string, currency?: string) => {
    if (!name) return defaultAccountId;
    const found = next.accounts.find((a) => normalize(a.name) === normalize(name));
    if (found) return found.id;
    const id = uid();
    next.accounts.push({ id, name, kind: 'checking', balance: 0, currency: currency || data.settings.currency, source: 'import' });
    return id;
  };
  const existing = new Set(data.transactions.map((t) => `${t.accountId}|${t.date}|${t.amount}|${normalize(t.description)}`));
  const added: Transaction[] = [];
  let duplicates = 0;
  for (const m of imp.movements) {
    const accId = accountId(m.account, m.currency);
    const key = `${accId}|${m.date}|${m.amount}|${normalize(m.description)}`;
    if (existing.has(key)) {
      duplicates++;
      continue;
    }
    existing.add(key);
    const byName = m.category ? data.categories.find((c) => normalize(c.name) === normalize(m.category!)) : undefined;
    const auto = categorize(m.description, m.amount, data);
    added.push({
      id: uid(),
      accountId: accId,
      date: m.date,
      amount: m.amount,
      description: m.description,
      categoryId: byName?.id ?? auto.categoryId,
      categorySource: byName ? 'user' : auto.source,
      channel: detectChannel(m.description),
    });
  }
  const delta = new Map<string, number>();
  for (const t of added) delta.set(t.accountId, (delta.get(t.accountId) ?? 0) + t.amount);
  next = {
    ...next,
    accounts: next.accounts.map((a) => (delta.has(a.id) ? { ...a, balance: a.balance + delta.get(a.id)! } : a)),
    transactions: [...next.transactions, ...added],
  };
  return { data: next, added: added.length, duplicates };
}
