import { categoryColor } from '../lib/families';
import { useMemo, useState } from 'react';
import { CatBadge, CatIcon, Icon } from '../components/icons';
import { Empty, Money, Sheet, toast } from '../components/ui';
import { aiAvailability } from '../lib/ai';
import { categorizeWithAI, learnFromCorrection } from '../lib/categorize';
import { Equivalent, type EquivResult } from '../components/Equivalent';
import { addRate, convert, deleteExchange, txCurrency } from '../lib/fx';
import { monthSummary } from '../lib/insights';
import { addMonths, capitalize, formatMoney, formatRate, prettyDescription, today } from '../lib/money';
import type { Transaction } from '../lib/types';
import { useStore } from '../store';

const DAY_FMT = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const MONTH_FMT = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

export function Transactions() {
  const { data, update } = useStore();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const [acc, setAcc] = useState<string>('');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [equiv, setEquiv] = useState<EquivResult | null>(null);

  const catOf = (id: string) => data.categories.find((c) => c.id === id);
  const accOf = (id: string) => data.accounts.find((a) => a.id === id);

  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return data.transactions
      .filter((t) => t.date.startsWith(month) && (!cat || t.categoryId === cat) && (!acc || t.accountId === acc) && (!needle || t.description.toLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.transactions, month, q, cat, acc]);

  const byDay = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of list) (m.get(t.date) ?? m.set(t.date, []).get(t.date)!).push(t);
    return [...m];
  }, [list]);

  const sum = monthSummary(data, month);
  const uncategorized = data.transactions.filter((t) => t.categorySource === 'default');
  const ai = aiAvailability(data);

  const runAI = async () => {
    setBusy(true);
    try {
      const items = uncategorized.slice(0, 100).map((t) => ({ id: t.id, description: t.description, amount: t.amount }));
      const result = await categorizeWithAI(items, data.categories, data);
      update((d) => ({ ...d, transactions: d.transactions.map((t) => (result[t.id] && t.categorySource === 'default' ? { ...t, categoryId: result[t.id], categorySource: 'ai' } : t)) }));
      toast(`IA: ${Object.keys(result).length} movimientos clasificados`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (t: Transaction) => {
    if (t.exchangeId) update((d) => deleteExchange(d, t.exchangeId!));
    else
      update((d) => ({
        ...d,
        transactions: d.transactions.filter((x) => x.id !== t.id),
        accounts: d.accounts.map((a) => (a.id === t.accountId ? { ...a, balance: a.balance - t.amount } : a)),
      }));
    setEditing(null);
  };

  return (
    <>
      <div className="row between mb">
        <button className="icon-btn lg" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior"><Icon name="back" size={18} stroke={2.4} /></button>
        <b style={{ fontSize: 18, letterSpacing: '-0.02em' }}>{capitalize(MONTH_FMT.format(new Date(`${month}-15`)))}</b>
        <button className="icon-btn lg" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente"><Icon name="chevron" size={18} stroke={2.4} /></button>
      </div>
      <div className="grid2 mb">
        <div className="card glass"><h2>Ingresos</h2><div className="mid pos">{formatMoney(sum.income)}</div></div>
        <div className="card glass"><h2>Gastos</h2><div className="mid neg">{formatMoney(sum.expenses)}</div></div>
      </div>
      <div className="field">
        <input type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar movimientos" />
      </div>
      {data.accounts.length > 1 && (
        <div className="chips">
          <button className={`chip ${acc ? '' : 'on'}`} onClick={() => setAcc('')}>Todas las cuentas</button>
          {data.accounts.filter((a) => data.transactions.some((t) => t.accountId === a.id)).map((a) => (
            <button key={a.id} className={`chip ${acc === a.id ? 'on' : ''}`} onClick={() => setAcc(a.id)}>{a.name}</button>
          ))}
        </div>
      )}
      <div className="chips mb">
        <button className={`chip ${cat ? '' : 'on'}`} onClick={() => setCat('')}>Todas</button>
        {data.categories.filter((c) => list.some((t) => t.categoryId === c.id) || cat === c.id).map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>
        ))}
      </div>

      {uncategorized.length > 0 && ai.ok && data.settings.aiCategorization && (
        <div className="alert">
          <Icon name="sparkles" size={18} />
          <div className="grow small">{uncategorized.length} movimientos sin categoría clara.</div>
          <button className="btn sm tinted" disabled={busy} onClick={runAI}>{busy ? 'Clasificando…' : 'Clasificar con IA'}</button>
        </div>
      )}

      {byDay.length === 0 && <Empty>No hay movimientos este mes. Pulsa + para añadir uno.</Empty>}
      {byDay.map(([date, txs]) => (
        <div key={date}>
          <div className="day">{DAY_FMT.format(new Date(`${date}T12:00:00`))}</div>
          <div className="card glass flush">
            <ul className="list">
              {txs.map((t) => (
                <li key={t.id} className="tap" onClick={() => setEditing(t)}>
                  <CatBadge id={t.categoryId} emoji={catOf(t.categoryId)?.icon} />
                  <div className="grow">
                    <div className="ellipsis">{prettyDescription(t.description)}</div>
                    <div className="small muted ellipsis">
                      {catOf(t.categoryId)?.name} · {accOf(t.accountId)?.name}
                      {t.channel === 'bizum' && ' · Bizum'}
                      {t.fx && ` · ${formatMoney(t.fx.amount, t.fx.currency)} a ${formatRate(t.fx.rate)}`}
                      {!t.fx && txCurrency(data, t) === 'VES' && (() => { const e = convert(data, Math.abs(t.amount), 'VES', 'USD', t.date); return e ? ` · ≈ ${formatMoney(e, 'USD')} (est.)` : ''; })()}
                      {t.categorySource === 'ai' && ' · IA'}
                    </div>
                  </div>
                  <Money cents={t.amount} currency={txCurrency(data, t)} sign />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}

      {editing && (
        <Sheet title="Movimiento" onClose={() => setEditing(null)}>
          <div className="center mb">
            <div className="big"><Money cents={editing.amount} currency={txCurrency(data, editing)} sign /></div>
            <div className="secondary">{prettyDescription(editing.description)}</div>
            <div className="small muted">{editing.date} · {accOf(editing.accountId)?.name}</div>
            {editing.note && <div className="tiny muted mt">{editing.note}</div>}
          </div>
          {editing.exchangeId ? (
            <p className="small muted center">Forma parte de un cambio de divisa. Al borrarlo se elimina la operación completa.</p>
          ) : (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>Cambia la categoría: la app lo recordará para este comercio.</p>
              <div className="catgrid mb">
                {data.categories.map((c) => (
                  <button key={c.id} style={{ ['--c' as string]: categoryColor(c.id) }} className={editing.categoryId === c.id ? 'on' : ''} onClick={() => { update((d) => learnFromCorrection(d, editing, c.id)); setEditing(null); }}>
                    <CatIcon id={c.id} emoji={c.icon} size={22} />
                    <span className="ellipsis" style={{ maxWidth: '100%' }}>{c.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {!editing.exchangeId && txCurrency(data, editing) !== 'USD' && (
            <div className="mb">
              <Equivalent key={editing.id} currency={txCurrency(data, editing)} date={editing.date} cents={Math.abs(editing.amount)} initial={editing.fx} defaultOpen={txCurrency(data, editing) === 'VES'} onChange={setEquiv} />
              <button className="btn tinted block mt" disabled={!equiv} onClick={() => {
                update((d) => ({ ...(equiv?.saveRate ? addRate(d, equiv.saveRate) : d), transactions: d.transactions.map((x) => (x.id === editing.id ? { ...x, fx: equiv?.fx } : x)) }));
                toast('Equivalente guardado');
                setEditing(null);
              }}>Guardar equivalente</button>
            </div>
          )}
          <button className="btn danger block" onClick={() => remove(editing)}><Icon name="trash" size={18} /> Eliminar</button>
        </Sheet>
      )}
    </>
  );
}
