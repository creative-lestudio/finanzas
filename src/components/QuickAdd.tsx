import { categoryColor } from '../lib/families';
import { useMemo, useState } from 'react';
import { budgetAlertFor } from '../lib/budgets';
import { categorize, detectChannel } from '../lib/categorize';
import { addRate } from '../lib/fx';
import { formatMoney, merchantKey, monthKey, parseAmount, today, uid } from '../lib/money';
import type { AppData, Transaction } from '../lib/types';
import { useStore } from '../store';
import { Equivalent, type EquivResult } from './Equivalent';
import { CatIcon, Icon } from './icons';
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
    : `Guardado: ${formatMoney(t.amount, data.accounts.find((a) => a.id === t.accountId)?.currency)} · ${name}`;
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

  const account = data.accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? data.settings.currency;
  const cats = data.categories.filter((c) => c.kind === kind);
  const ordered = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const t of data.transactions.slice(-300)) freq[t.categoryId] = (freq[t.categoryId] ?? 0) + 1;
    return [...cats].sort((a, b) => (freq[b.id] ?? 0) - (freq[a.id] ?? 0));
  }, [cats, data.transactions]);

  const cents = parseAmount(amount);
  const signed = cents ? (kind === 'expense' ? -Math.abs(cents) : Math.abs(cents)) : 0;
  const suggested = description ? categorize(description, signed || -1, data).categoryId : null;
  const chosen = categoryId ?? (suggested && cats.some((c) => c.id === suggested) ? suggested : null);

  const save = () => {
    if (!signed || !chosen || !accountId) return;
    const desc = description.trim() || data.categories.find((c) => c.id === chosen)!.name;
    const { next, message } = saveTransaction(equiv?.saveRate ? addRate(data, equiv.saveRate) : data, {
      accountId,
      date,
      amount: signed,
      description: desc,
      categoryId: chosen,
      categorySource: 'user',
      channel: account?.kind === 'cash' ? 'cash' : detectChannel(desc),
      fx: equiv?.fx,
    });
    update(() => next);
    toast(message);
    onClose();
  };

  return (
    <Sheet title="Nuevo movimiento" onClose={onClose}>
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
      <div className="catgrid mb">
        {ordered.slice(0, 12).map((c) => (
          <button key={c.id} style={{ ['--c' as string]: categoryColor(c.id) }} className={chosen === c.id ? 'on' : ''} onClick={() => setCategoryId(c.id)}>
            <CatIcon id={c.id} emoji={c.icon} size={22} />
            <span className="ellipsis" style={{ maxWidth: '100%' }}>{c.name}</span>
          </button>
        ))}
      </div>
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
      <button className="btn primary block mt" disabled={!signed || !chosen} onClick={save}>
        Guardar {signed ? formatMoney(signed, currency) : ''}
      </button>
    </Sheet>
  );
}
