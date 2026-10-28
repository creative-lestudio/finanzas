import { useMemo, useState } from 'react';
import { categorizeWithAI, learnFromCorrection } from '../lib/categorize';
import { addMonths, today } from '../lib/money';
import { monthSummary } from '../lib/insights';
import type { Transaction } from '../lib/types';
import { useStore } from '../store';
import { Empty, Money, Sheet, toast } from '../components/ui';

const DAY_FMT = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const MONTH_FMT = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

export function Transactions() {
  const { data, update } = useStore();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);

  const catOf = (id: string) => data.categories.find((c) => c.id === id);
  const accOf = (id: string) => data.accounts.find((a) => a.id === id);

  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return data.transactions
      .filter((t) => t.date.startsWith(month) && (!cat || t.categoryId === cat) && (!needle || t.description.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.transactions, month, q, cat]);

  const byDay = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of list) (m.get(t.date) ?? m.set(t.date, []).get(t.date)!).push(t);
    return [...m];
  }, [list]);

  const sum = monthSummary(data, month);
  const uncategorized = data.transactions.filter((t) => t.categorySource === 'default');

  const runAI = async () => {
    const key = data.settings.anthropicApiKey;
    if (!key) return;
    setBusy(true);
    try {
      const items = uncategorized.slice(0, 100).map((t) => ({ id: t.id, description: t.description, amount: t.amount }));
      const result = await categorizeWithAI(items, data.categories, key);
      update((d) => ({
        ...d,
        transactions: d.transactions.map((t) => (result[t.id] && t.categorySource === 'default' ? { ...t, categoryId: result[t.id], categorySource: 'ai' } : t)),
      }));
      toast(`IA: ${Object.keys(result).length} movimientos clasificados`);
    } catch (e) {
      toast(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const remove = (t: Transaction) => {
    update((d) => ({
      ...d,
      transactions: d.transactions.filter((x) => x.id !== t.id),
      accounts: d.accounts.map((a) => (a.id === t.accountId ? { ...a, balance: a.balance - t.amount } : a)),
    }));
    setEditing(null);
  };

  return (
    <>
      <div className="row between" style={{ marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">‹</button>
        <b style={{ textTransform: 'capitalize' }}>{MONTH_FMT.format(new Date(`${month}-15`))}</b>
        <button className="btn ghost" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">›</button>
      </div>
      <div className="grid2" style={{ marginBottom: 10 }}>
        <div className="card" style={{ margin: 0 }}><div className="small muted">Ingresos</div><Money cents={sum.income} className="pos" /></div>
        <div className="card" style={{ margin: 0 }}><div className="small muted">Gastos</div><Money cents={sum.expenses} /></div>
      </div>
      <div className="field">
        <input type="search" placeholder="Buscar movimientos" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="chips" style={{ marginBottom: 8 }}>
        <button className={`chip ${cat ? '' : 'on'}`} onClick={() => setCat('')}>Todas</button>
        {data.categories.filter((c) => sum.byCategory[c.id] || (c.kind !== 'expense' && list.some((t) => t.categoryId === c.id))).map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.icon} {c.name}</button>
        ))}
      </div>

      {uncategorized.length > 0 && data.settings.aiCategorization && !data.settings.offlineOnly && data.settings.anthropicApiKey && (
        <div className="alert">
          <span>✨</span>
          <div className="grow small">{uncategorized.length} movimientos sin categoría clara.</div>
          <button className="btn small" disabled={busy} onClick={runAI}>{busy ? 'Clasificando…' : 'Clasificar con IA'}</button>
        </div>
      )}

      {byDay.length === 0 && <Empty>No hay movimientos este mes. Pulsa + para añadir uno.</Empty>}
      {byDay.map(([date, txs]) => (
        <div key={date}>
          <div className="day">{DAY_FMT.format(new Date(`${date}T12:00:00`))}</div>
          <div className="card" style={{ padding: '4px 16px' }}>
            <ul className="list">
              {txs.map((t) => (
                <li key={t.id} onClick={() => setEditing(t)} style={{ cursor: 'pointer' }}>
                  <span className="icon">{catOf(t.categoryId)?.icon ?? '❔'}</span>
                  <div className="grow">
                    <div className="ellipsis">{t.description}</div>
                    <div className="small muted ellipsis">
                      {catOf(t.categoryId)?.name} · {accOf(t.accountId)?.name}
                      {t.channel === 'bizum' && ' · Bizum'}
                      {t.categorySource === 'ai' && ' · ✨ IA'}
                    </div>
                  </div>
                  <Money cents={t.amount} sign />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {editing && (
        <Sheet title="Cambiar categoría" onClose={() => setEditing(null)}>
          <p className="small" style={{ marginTop: 0 }}>
            <b>{editing.description}</b> · <Money cents={editing.amount} sign />
          </p>
          <p className="small muted">La app recordará esta elección para los próximos movimientos de este comercio.</p>
          <div className="catgrid" style={{ marginBottom: 14 }}>
            {data.categories.map((c) => (
              <button
                key={c.id}
                className={editing.categoryId === c.id ? 'on' : ''}
                onClick={() => {
                  update((d) => learnFromCorrection(d, editing, c.id));
                  setEditing(null);
                }}
              >
                <span>{c.icon}</span>
                <span className="ellipsis" style={{ maxWidth: '100%' }}>{c.name}</span>
              </button>
            ))}
          </div>
          <button className="btn danger block" onClick={() => remove(editing)}>Eliminar movimiento</button>
        </Sheet>
      )}
    </>
  );
}
