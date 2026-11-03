import { useState } from 'react';
import { budgetAlertFor } from '../lib/budgets';
import { categorize, detectChannel } from '../lib/categorize';
import { addRate } from '../lib/fx';
import { formatMoney, merchantKey, monthKey, parseAmount, today, uid } from '../lib/money';
import { guideTasks, patchGuide } from '../lib/guide';
import type { AppData, Transaction } from '../lib/types';
import { COACH } from './Coach';
import { useStore } from '../store';
import { CategoryPicker } from './CategoryPicker';
import { Equivalent, type EquivResult } from './Equivalent';
import { Icon } from './icons';
import { Sheet, toast } from './ui';

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
export function QuickAdd({ onClose, onVoice }: { onClose: () => void; onVoice: () => void }) {
  const { data, update } = useStore();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const usable = data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto' && a.kind !== 'loan');
  const [accountId, setAccountId] = useState(usable.find((a) => a.kind === 'cash')?.id ?? usable[0]?.id);
  const [date, setDate] = useState(today());
  // Equivalente en otra moneda (cobros y pagos en bolívares, p. ej.).
  const [equiv, setEquiv] = useState<EquivResult | null>(null);
  // Guía de primer uso: el primer movimiento puede ser de prueba (se borra al terminar la guía) o real.
  const guide = guideTasks(data);
  const asking = !!guide && !guide.movement;
  const [asTest, setAsTest] = useState(true);

  const account = data.accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? data.settings.currency;
  const cats = data.categories.filter((c) => c.kind === kind);

  const cents = parseAmount(amount);
  const signed = cents ? (kind === 'expense' ? -Math.abs(cents) : Math.abs(cents)) : 0;
  const suggested = description ? categorize(description, signed || -1, data).categoryId : null;
  const chosen = categoryId ?? (suggested && cats.some((c) => c.id === suggested) ? suggested : null);

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
    update(() => next);
    toast(message);
    onClose();
  };

  return (
    <Sheet title="Nuevo movimiento" onClose={onClose}>
      {asking && (
        <div className="coach-hero" style={{ borderRadius: 22, marginBottom: 12, padding: 12, gridTemplateColumns: '64px 1fr' }}>
          <img src={COACH.hola} alt="" style={{ width: 64, height: 64 }} />
          <div className="bubble" style={{ fontSize: 14 }}>
            <b>Tu primer movimiento</b>
            Pon el importe, elige la categoría y guarda. Abajo decide si lo registras <b>como prueba</b> (lo borro al terminar) o <b>como real</b>.
          </div>
        </div>
      )}
      <button className="pill-mic lg" onClick={onVoice}>
        <span className="dot"><Icon name="mic" size={18} /></span>
        <span className="grow">
          <b>Dictar</b>
          <div className="small muted">"Gasté 50 euros en Mercadona"</div>
        </span>
      </button>
      <div className="seg">
        <button className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setCategoryId(null); }}>Gasto</button>
        <button className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setCategoryId(null); }}>Ingreso</button>
      </div>
      <div className="amount-wrap">
        <input className="amount-input" inputMode="decimal" placeholder="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" onKeyDown={(e) => e.key === 'Enter' && save()} style={{ width: `${Math.max(2, amount.length + 1)}ch`, maxWidth: '80%' }} />
        <span className="cur">{currency}</span>
      </div>
      <div className="field">
        <input placeholder="Concepto (opcional): café, taxi…" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Concepto" />
      </div>
      <CategoryPicker kind={kind} value={chosen} onChange={setCategoryId} />
      <div className="grid2">
        <div className="field">
          <label>
            Cuenta
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {usable.map((a) => (
                <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <label>
            Fecha
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </div>
      <Equivalent key={currency} currency={currency} date={date} cents={signed ? Math.abs(signed) : null} defaultOpen={currency === 'VES'} onChange={setEquiv} />
      {asking && (
        <div className="seg mt" role="group" aria-label="Tipo de registro">
          <button className={asTest ? 'on' : ''} onClick={() => setAsTest(true)}>Registrar como prueba</button>
          <button className={!asTest ? 'on' : ''} onClick={() => setAsTest(false)}>Registro real</button>
        </div>
      )}
      <button className="btn primary block mt" disabled={!signed || !chosen} onClick={save}>
        Guardar {signed ? formatMoney(signed, currency) : ''}
      </button>
    </Sheet>
  );
}
