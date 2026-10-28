import { useMemo, useState } from 'react';
import { budgetAlertFor } from '../lib/budgets';
import { categorize, detectChannel } from '../lib/categorize';
import { formatMoney, merchantKey, monthKey, parseAmount, today, uid } from '../lib/money';
import { useStore } from '../store';
import { Sheet, toast } from './ui';

/** Entrada manual rápida: importe, categoría y listo. Pensada para efectivo y gastos pequeños. */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(data.accounts.find((a) => a.kind === 'cash')?.id ?? data.accounts[0]?.id);
  const [date, setDate] = useState(today());

  const cats = data.categories.filter((c) => c.kind === kind);
  // Categorías más usadas primero, para registrar con un toque.
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
    const account = data.accounts.find((a) => a.id === accountId)!;
    const d = data;
    {
      const next = {
        ...d,
        accounts: d.accounts.map((a) => (a.id === accountId ? { ...a, balance: a.balance + signed } : a)),
        transactions: [
          ...d.transactions,
          {
            id: uid(),
            accountId,
            date,
            amount: signed,
            description: desc,
            categoryId: chosen,
            categorySource: 'user' as const,
            channel: account.kind === 'cash' ? ('cash' as const) : detectChannel(desc),
          },
        ],
        learned: description.trim() && merchantKey(desc) ? { ...d.learned, [merchantKey(desc)]: chosen } : d.learned,
      };
      const alert = signed < 0 ? budgetAlertFor(next, chosen, monthKey(date), Number(date.slice(8))) : undefined;
      if (alert) {
        toast(
          alert.state === 'over'
            ? `✕ Has superado el presupuesto de ${data.categories.find((c) => c.id === chosen)?.name} (${formatMoney(alert.spent)} de ${formatMoney(alert.limit)})`
            : `⚠ Llevas el ${Math.round(alert.ratio * 100)} % del presupuesto de ${data.categories.find((c) => c.id === chosen)?.name}`,
        );
      } else toast('Movimiento guardado');
      update(() => next);
    }
    onClose();
  };

  return (
    <Sheet title="Nuevo movimiento" onClose={onClose}>
      <div className="seg">
        <button className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setCategoryId(null); }}>Gasto</button>
        <button className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setCategoryId(null); }}>Ingreso</button>
      </div>
      <input
        className="amount-input"
        inputMode="decimal"
        placeholder="0,00 €"
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Importe"
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <div className="field">
        <input placeholder="Concepto (opcional): café, taxi..." value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Concepto" />
      </div>
      <div className="catgrid" style={{ marginBottom: 12 }}>
        {ordered.slice(0, 12).map((c) => (
          <button key={c.id} className={chosen === c.id ? 'on' : ''} onClick={() => setCategoryId(c.id)}>
            <span>{c.icon}</span>
            <span className="ellipsis" style={{ maxWidth: '100%' }}>{c.name}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <div className="field">
          <label>
            Cuenta
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto').map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
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
      <button className="btn primary block" disabled={!signed || !chosen} onClick={save}>
        Guardar {signed ? formatMoney(signed) : ''}
      </button>
    </Sheet>
  );
}
