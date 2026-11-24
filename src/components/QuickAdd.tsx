import { useMemo, useRef, useState } from 'react';
import { budgetAlertFor } from '../lib/budgets';
import { categorize, detectChannel } from '../lib/categorize';
import { addRate } from '../lib/fx';
import { formatMoney, merchantKey, monthKey, parseAmount, today, uid } from '../lib/money';
import { aiAvailability } from '../lib/ai';
import { FREQ_LABEL, nextOccurrence } from '../lib/recurring';
import { decisionTips, newPraise } from '../lib/mentor';
import { guideTasks, patchGuide } from '../lib/guide';
import { scanReceipt } from '../lib/receipt';
import type { Prefill } from '../lib/shortcut';
import type { AppData, Transaction } from '../lib/types';
import { COACH } from './Coach';
import { useStore } from '../store';
import { CategoryPicker } from './CategoryPicker';
import { Equivalent, type EquivResult } from './Equivalent';
import { Icon } from './icons';
import { Sheet, toast } from './ui';
import { t as _t } from '../lib/i18n';

/** Guarda un movimiento manual, ajusta el saldo y avisa si se acerca a un presupuesto. */
export function saveTransaction(data: AppData, t: Omit<Transaction, 'id'>): { next: AppData; message: string } {
  const tx: Transaction = { ...t, id: uid() };
  const key = merchantKey(t.description);
  const next: AppData = {
    ...data,
    accounts: data.accounts.map((a) => (a.id === t.accountId ? { ...a, balance: a.balance + t.amount } : a)),
    transactions: [...data.transactions, tx],
    learned: key && t.categorySource === 'user' ? { ...data.learned, [key]: t.categoryId } : data.learned,
  };
  const name = data.categories.find((c) => c.id === t.categoryId)?.name;
  const alert = t.amount < 0 ? budgetAlertFor(next, t.categoryId, monthKey(t.date), Number(t.date.slice(8))) : undefined;
  const message = alert
    ? alert.state === 'over'
      ? `Has superado el presupuesto de ${name}: ${formatMoney(alert.spent)} de ${formatMoney(alert.limit)}`
      : `Llevas el ${Math.round(alert.ratio * 100)} % del presupuesto de ${name}`
    : `Guardado: ${t.fx && t.fx.amount > 0 ? `${t.amount < 0 ? '−' : '+'}${formatMoney(t.fx.amount, t.fx.currency)} (${formatMoney(Math.abs(t.amount), data.accounts.find((a) => a.id === t.accountId)?.currency)})` : formatMoney(t.amount, data.accounts.find((a) => a.id === t.accountId)?.currency)} · ${name}`;
  return { next, message };
}

/** Entrada manual rápida: importe, categoría y listo. Pensada para efectivo y gastos pequeños. */
export function QuickAdd({ onClose, onVoice, prefill }: { onClose: () => void; onVoice: () => void; prefill?: Prefill }) {
  const { data, update } = useStore();
  const [kind, setKind] = useState<'expense' | 'income'>(prefill?.kind ?? 'expense');
  const [amount, setAmount] = useState(prefill?.amount ?? '');
  const [description, setDescription] = useState(prefill?.merchant ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const usable = data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto' && a.kind !== 'loan');
  const byHint = (hint?: string, cur?: string) => {
    const h = hint?.toLowerCase();
    return (h && usable.find((a) => a.name.toLowerCase().includes(h))) || (cur && usable.find((a) => a.currency === cur)) || undefined;
  };
  const [accountId, setAccountId] = useState(byHint(prefill?.account, prefill?.currency)?.id ?? usable.find((a) => a.kind === 'cash')?.id ?? usable[0]?.id);
  const [date, setDate] = useState(prefill?.date ?? today());
  // Escanear un recibo con IA: la foto se lee y se descarta.
  const [scanning, setScanning] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const scan = async (file?: File) => {
    if (!file) return;
    setScanning(true);
    try {
      const r = await scanReceipt(data, file);
      if (!r.amount) { toast(_t("No pude leer el importe. Prueba con otra foto más de frente y con buena luz.")); return; }
      setKind('expense');
      setAmount(String(r.amount).replace('.', ','));
      if (r.merchant) setDescription(r.merchant);
      if (r.date) setDate(r.date);
      const acc = byHint(undefined, r.currency ?? undefined);
      if (acc) setAccountId(acc.id);
      const cat = r.category && data.categories.find((c) => c.kind === 'expense' && c.name.toLowerCase() === r.category!.toLowerCase());
      if (cat) setCategoryId(cat.id);
      toast(_t("Leído. Revisa los datos y guarda."));
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'No se pudo leer el recibo.');
    } finally {
      setScanning(false);
      if (scanRef.current) scanRef.current.value = '';
    }
  };
  const openScan = () => {
    const a = aiAvailability(data);
    if (!a.ok) { toast(a.reason ?? 'La IA no está disponible.'); return; }
    scanRef.current?.click();
  };
  // Equivalente en otra moneda (cobros y pagos en bolívares, p. ej.).
  const [equiv, setEquiv] = useState<EquivResult | null>(null);
  // Guía de primer uso: el primer movimiento puede ser de prueba (se borra al terminar la guía) o real.
  const guide = guideTasks(data);
  const asking = !!guide && !guide.movement;
  const [asTest, setAsTest] = useState(true);
  // Repetir: crea una regla recurrente a partir de este movimiento.
  const [repeat, setRepeat] = useState<'' | 'weekly' | 'monthly' | 'yearly'>('');

  const account = data.accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? data.settings.currency;
  const cats = data.categories.filter((c) => c.kind === kind);

  const cents = parseAmount(amount);
  const signed = cents ? (kind === 'expense' ? -Math.abs(cents) : Math.abs(cents)) : 0;
  const suggested = description ? categorize(description, signed || -1, data).categoryId : null;
  const chosen = categoryId ?? (suggested && cats.some((c) => c.id === suggested) ? suggested : null);

  // Mientras escribes: avisos (duplicado, importe raro, cuenta en negativo) y consejos (gasto grande).
  const tips = useMemo(() => (cents ? decisionTips(data, { amount: Math.abs(cents), kind, accountId, categoryId: chosen ?? undefined, description, date }) : []), [data, cents, kind, accountId, chosen, description, date]);

  const save = () => {
    if (!signed || !chosen || !accountId) return;
    const base = description.trim() || data.categories.find((c) => c.id === chosen)!.name;
    const test = asking && asTest;
    const desc = test ? `Prueba · ${base}` : base;
    let { next, message } = saveTransaction(equiv?.saveRate ? addRate(data, equiv.saveRate) : data, {
      accountId,
      date,
      amount: signed,
      description: desc,
      categoryId: chosen,
      categorySource: 'user',
      channel: account?.kind === 'cash' ? 'cash' : detectChannel(desc),
      fx: equiv?.fx,
    });
    if (asking) {
      const id = next.transactions[next.transactions.length - 1].id;
      next = patchGuide(next, { movement: true, testTx: test ? [...(guide?.testTx ?? []), id] : guide?.testTx ?? [] });
      message = test ? 'Movimiento de prueba guardado: lo eliminaré al terminar la guía.' : message;
    }
    if (repeat && !test) {
      next = { ...next, recurring: [...(next.recurring ?? []), { id: uid(), accountId, amount: signed, description: base, categoryId: chosen, freq: repeat, next: nextOccurrence(date, repeat, Number(date.slice(8))), day: Number(date.slice(8)), active: true }] };
      message = `${message} · se repetirá ${FREQ_LABEL[repeat].toLowerCase()}`;
    }
    update(() => next);
    toast(message);
    // Si con este movimiento acabas de hacer algo bien, te lo decimos.
    const praise = newPraise(data, next);
    if (praise) window.setTimeout(() => toast(`${praise.title} ${praise.text}`), 1600);
    onClose();
  };

  return (
    <Sheet title={_t("Nuevo movimiento")} onClose={onClose}>
      {asking && (
        <div className="coach-hero" style={{ borderRadius: 22, marginBottom: 12, padding: 12, gridTemplateColumns: '64px 1fr' }}>
          <img src={COACH.hola} alt="" style={{ width: 64, height: 64 }} />
          <div className="bubble" style={{ fontSize: 14 }}>
            <b>{_t("Tu primer movimiento")}</b>
            {_t("Pon el importe, elige la categoría y guarda. Abajo decide si lo registras")} <b>{_t("como prueba")}</b> {_t("(lo borro al terminar) o")} <b>{_t("como real")}</b>.
          </div>
        </div>
      )}
      <button className="pill-mic lg" onClick={onVoice}>
        <span className="dot"><Icon name="mic" size={18} /></span>
        <span className="grow">
          <b>{_t("Dictar")}</b>
          <div className="small muted">{_t("\"Gasté 50 euros en Mercadona\"")}</div>
        </span>
      </button>
      <input ref={scanRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void scan(e.target.files?.[0])} />
      <button className={`pill-mic lg ${prefill?.scan ? 'attn' : ''}`} onClick={openScan} disabled={scanning} style={{ marginTop: 8 }}>
        <span className="dot"><Icon name="receipt" size={18} /></span>
        <span className="grow">
          <b>{scanning ? _t("Leyendo el recibo…") : _t("Escanear recibo")}</b>
          <div className="small muted">{_t("Una foto y la IA rellena importe, comercio y fecha. La foto no se guarda.")}</div>
        </span>
      </button>
      <div className="seg">
        <button className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setCategoryId(null); }}>{_t("Gasto")}</button>
        <button className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setCategoryId(null); }}>{_t("Ingreso")}</button>
      </div>
      <div className="amount-wrap">
        <input className="amount-input" inputMode="decimal" placeholder="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={_t("Importe")} onKeyDown={(e) => e.key === 'Enter' && save()} style={{ width: `${Math.max(2, amount.length + 1)}ch`, maxWidth: '80%' }} />
        <span className="cur">{currency}</span>
      </div>
      <div className="field">
        <input placeholder={_t("Concepto (opcional): café, taxi…")} value={description} onChange={(e) => setDescription(e.target.value)} aria-label={_t("Concepto")} />
      </div>
      <CategoryPicker kind={kind} value={chosen} onChange={setCategoryId} />
      {tips.map((tp, i) => (
        <div key={i} className="callout" role={tp.level === 'warn' ? 'alert' : 'note'} style={{ borderColor: tp.level === 'warn' ? 'var(--bad)' : 'var(--accent)' }}>
          <b style={{ color: tp.level === 'warn' ? 'var(--bad)' : 'var(--accent-ink)' }}>{tp.level === 'warn' ? _t('Ojo') : _t('Consejo')}</b> {tp.text}
        </div>
      ))}
      <div className="grid2">
        <div className="field">
          <label>
            {_t("Cuenta")}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {usable.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <label>
            {_t("Fecha")}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="field">
        <label>{_t("Repetir")}
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} disabled={asking && asTest}>
            <option value="">{_t("No se repite")}</option>
            <option value="weekly">{_t("Cada semana")}</option>
            <option value="monthly">{_t("Cada mes")}</option>
            <option value="yearly">{_t("Cada año")}</option>
          </select>
        </label>
      </div>
      <Equivalent key={currency} currency={currency} date={date} cents={signed ? Math.abs(signed) : null} defaultOpen={currency === 'VES'} onChange={setEquiv} />
      {asking && (
        <div className="seg mt" role="group" aria-label={_t("Tipo de registro")}>
          <button className={asTest ? 'on' : ''} onClick={() => setAsTest(true)}>{_t("Registrar como prueba")}</button>
          <button className={!asTest ? 'on' : ''} onClick={() => setAsTest(false)}>{_t("Registro real")}</button>
        </div>
      )}
      <button className="btn primary block mt" disabled={!signed || !chosen} onClick={save}>
        {_t("Guardar")} {signed ? formatMoney(signed, currency) : ''}
      </button>
    </Sheet>
  );
}
