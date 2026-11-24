import { useState } from 'react';
import { addRate } from '../lib/fx';
import { formatMoney, parseAmount, prettyDescription } from '../lib/money';
import { editTransaction } from '../lib/txedit';
import type { Transaction } from '../lib/types';
import { useStore } from '../store';
import { CategoryPicker } from './CategoryPicker';
import { Equivalent, type EquivResult } from './Equivalent';
import { Icon } from './icons';
import { toast } from './ui';

/** Editor completo de un movimiento: tipo, importe, concepto, fecha, cuenta, categoría, nota y equivalente. */
export function TransactionEditor({ tx, onDone, onRemove }: { tx: Transaction; onDone: () => void; onRemove: () => void }) {
  const { data, update } = useStore();
  const locked = Boolean(tx.exchangeId); // forma parte de un cambio de divisa: solo concepto y nota
  const [kind, setKind] = useState<'expense' | 'income'>(tx.amount < 0 ? 'expense' : 'income');
  const [amount, setAmount] = useState(String(Math.abs(tx.amount) / 100).replace('.', ','));
  const [description, setDescription] = useState(tx.description);
  const [date, setDate] = useState(tx.date);
  const [accountId, setAccountId] = useState(tx.accountId);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [note, setNote] = useState(tx.note ?? '');
  const [equiv, setEquiv] = useState<EquivResult | null>(null);
  const [equivTouched, setEquivTouched] = useState(false);

  const usable = data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto' || a.id === tx.accountId);
  const currency = data.accounts.find((a) => a.id === accountId)?.currency ?? data.settings.currency;
  const cents = Math.abs(parseAmount(amount) ?? 0);
  const signed = kind === 'expense' ? -cents : cents;
  const changed = signed !== tx.amount || description.trim() !== tx.description || date !== tx.date || accountId !== tx.accountId || categoryId !== tx.categoryId || note.trim() !== (tx.note ?? '') || equivTouched;
  const valid = locked ? description.trim().length > 0 : cents > 0 && description.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && !!categoryId;

  const save = () => {
    if (!valid) return;
    update((d) => {
      const base = equiv?.saveRate && equivTouched ? addRate(d, equiv.saveRate) : d;
      return editTransaction(base, tx.id, locked
        ? { description: description.trim(), note: note.trim() || undefined }
        : { amount: signed, description: description.trim(), date, accountId, categoryId, note: note.trim() || undefined, ...(equivTouched ? { fx: equiv?.fx } : {}) });
    });
    toast('Movimiento actualizado');
    onDone();
  };

  return (
    <>
      <div className="small muted center" style={{ marginBottom: 8 }}>
        {prettyDescription(tx.description)} · {tx.date}
        {tx.recurringId && <> · <span title="Creado por una regla recurrente"><Icon name="repeat" size={12} /> recurrente</span></>}
      </div>
      {locked && <p className="small muted center" style={{ marginTop: 0 }}>Forma parte de un cambio de divisa: solo puedes cambiar el concepto y la nota. Al borrarlo se elimina la operación completa.</p>}
      {!locked && (
        <div className="seg">
          <button className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); if (tx.amount > 0) setCategoryId(''); }}>Gasto</button>
          <button className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); if (tx.amount < 0) setCategoryId(''); }}>Ingreso</button>
        </div>
      )}
      {!locked && (
        <div className="amount-wrap">
          <input className="amount-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" style={{ width: `${Math.max(2, amount.length + 1)}ch`, maxWidth: '80%' }} />
          <span className="cur">{currency}</span>
        </div>
      )}
      <div className="field"><label>Concepto<input value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Concepto" /></label></div>
      {!locked && (
        <>
          <CategoryPicker kind={kind} value={categoryId || null} onChange={setCategoryId} />
          <div className="grid2">
            <div className="field">
              <label>Cuenta
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta">
                  {usable.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                </select>
              </label>
            </div>
            <div className="field"><label>Fecha<input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" /></label></div>
          </div>
          {accountId !== tx.accountId && (
            <p className="tiny muted" style={{ marginTop: 0 }}>El dinero se devuelve a «{data.accounts.find((a) => a.id === tx.accountId)?.name}» y se anota en «{data.accounts.find((a) => a.id === accountId)?.name}».</p>
          )}
        </>
      )}
      <div className="field"><label>Nota (opcional)<input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota" /></label></div>
      {!locked && currency !== 'USD' && (
        <div className="mb">
          <Equivalent key={`${tx.id}-${currency}`} currency={currency} date={date} cents={cents || null} initial={accountId === tx.accountId ? tx.fx : undefined} defaultOpen={Boolean(tx.fx) || currency === 'VES'} onChange={(r) => { setEquiv(r); setEquivTouched(true); }} />
        </div>
      )}
      <button className="btn primary block" disabled={!valid || !changed} onClick={save}>Guardar cambios{!locked && cents ? ` · ${formatMoney(signed, currency)}` : ''}</button>
      <button className="btn danger block mt" onClick={onRemove}><Icon name="trash" size={18} /> Eliminar</button>
    </>
  );
}
