import { useMemo, useState } from 'react';
import { childrenOf, rootOf } from '../lib/categories';
import { categoryColor } from '../lib/families';
import { txBase } from '../lib/fx';
import { netWorth } from '../lib/health';
import { formatMoney, prettyDescription } from '../lib/money';
import { buildReport, monthsFor, ranking, type RangeKey } from '../lib/reports';
import { useStore } from '../store';
import { Donut, MonthBars } from './Charts';
import { CatBadge } from './icons';
import { Segmented } from './ui';

/** Resumen global: posición, ingresos y gastos totales y por mes, y su reparto por categoría. */
export function Reports() {
  const { data } = useStore();
  const base = data.settings.currency;
  const [range, setRange] = useState<RangeKey>('3');
  const [open, setOpen] = useState<string | null>(null);
  const months = useMemo(() => monthsFor(data, range), [data, range]);
  const r = useMemo(() => buildReport(data, months), [data, months]);
  const nw = useMemo(() => netWorth(data), [data]);
  const name = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;
  const exp = ranking(r.expenseByRoot);
  const inc = ranking(r.incomeByRoot);
  const saving = r.income > 0 ? Math.round((r.net / r.income) * 100) : null;

  return (
    <>
      <Segmented value={range} onChange={(v) => setRange(v as RangeKey)} options={[['1', 'Este mes'], ['3', '3 meses'], ['12', '12 meses'], ['all', 'Todo']]} />

      <div className="grid2 mb">
        <div className="card glass"><h2>Patrimonio neto</h2><div className="mid">{formatMoney(nw.net, base)}</div><div className="tiny muted">Hoy</div></div>
        <div className="card glass"><h2>Disponible</h2><div className="mid">{formatMoney(nw.liquid, base)}</div><div className="tiny muted">Cuentas y efectivo</div></div>
      </div>

      <div className="card glass">
        <div className="grid2" style={{ gap: 18 }}>
          <div><div className="small muted">Ingresos</div><div className="mid pos">{formatMoney(r.income, base)}</div></div>
          <div><div className="small muted">Gastos</div><div className="mid neg">{formatMoney(r.expenses, base)}</div></div>
          <div><div className="small muted">Balance</div><div className={`mid ${r.net >= 0 ? 'pos' : 'neg'}`}>{r.net >= 0 ? '+' : ''}{formatMoney(r.net, base)}</div></div>
          <div><div className="small muted">Ahorro</div><div className={`mid ${saving !== null && saving >= 0 ? 'pos' : 'neg'}`}>{saving === null ? '—' : `${saving} %`}</div></div>
        </div>
        {r.missingRates.size > 0 && <p className="tiny" style={{ color: 'var(--warn)', marginBottom: 0 }}>Faltan tasas de {[...r.missingRates].join(', ')}: esos importes no se han podido sumar. Anótalas en Divisas.</p>}
      </div>

      {r.perMonth.length > 1 && (
        <div className="card glass">
          <div className="card-head"><h2>Por mes</h2><span className="tiny muted"><b style={{ color: 'var(--good)' }}>■</b> Ingresos <b style={{ color: 'var(--bad)' }}>■</b> Gastos</span></div>
          <MonthBars rows={r.perMonth} base={base} />
          <ul className="list plain" style={{ margin: '8px -18px 0' }}>
            {[...r.perMonth].reverse().slice(0, 12).map((m) => (
              <li key={m.month} style={{ minHeight: 44 }}>
                <div className="grow small">{new Date(`${m.month}-15`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</div>
                <div className="small pos">+{formatMoney(m.income, base)}</div>
                <div className="small neg">−{formatMoney(m.expenses, base)}</div>
                <b className={`small ${m.income - m.expenses >= 0 ? 'pos' : 'neg'}`} style={{ minWidth: 76, textAlign: 'right' }}>{formatMoney(m.income - m.expenses, base)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card glass">
        <h2>Gastos por categoría</h2>
        {exp.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Sin gastos en este periodo.</p> : (
          <>
            <div className="row" style={{ justifyContent: 'center', margin: '4px 0 10px' }}>
              <Donut parts={exp.map((e) => ({ id: e.id, value: e.value, color: categoryColor(e.id) }))} center={formatMoney(r.expenses, base)} />
            </div>
            <ul className="list plain" style={{ margin: '0 -18px' }}>
              {exp.map((e) => {
                const subs = childrenOf(data.categories, e.id).map((c) => ({ id: c.id, value: r.expenseByCategory[c.id] ?? 0 })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
                const own = r.expenseByCategory[e.id] ?? 0;
                const isOpen = open === e.id;
                return (
                  <li key={e.id} style={{ display: 'block', padding: 0 }}>
                    <div className="row tap" style={{ padding: '10px 18px' }} onClick={() => subs.length && setOpen(isOpen ? null : e.id)}>
                      <CatBadge id={e.id} />
                      <div className="grow"><div className="ellipsis">{name(e.id)}</div><div className="tiny muted">{Math.round(e.pct * 100)} %{subs.length ? ` · ${subs.length} subcategorías` : ''}</div></div>
                      <b className="num">{formatMoney(e.value, base)}</b>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '0 18px 10px 70px' }}>
                        {subs.map((s) => <div key={s.id} className="row small" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>{name(s.id)}</span><span className="num">{formatMoney(s.value, base)}</span></div>)}
                        {own > 0 && <div className="row small muted" style={{ justifyContent: 'space-between', padding: '4px 0' }}><span>General</span><span className="num">{formatMoney(own, base)}</span></div>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {inc.length > 0 && (
        <div className="card glass">
          <h2>Ingresos por categoría</h2>
          <ul className="list plain" style={{ margin: '0 -18px' }}>
            {inc.map((e) => (
              <li key={e.id}><CatBadge id={e.id} /><div className="grow"><div className="ellipsis">{name(e.id)}</div><div className="tiny muted">{Math.round(e.pct * 100)} %</div></div><b className="num pos">{formatMoney(e.value, base)}</b></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Movimientos del mes agrupados por categoría madre, con subcategorías y detalle desplegable. */
export function ByCategory({ month, kind }: { month: string; kind: 'expense' | 'income' }) {
  const { data } = useStore();
  const base = data.settings.currency;
  const [open, setOpen] = useState<string | null>(null);
  const kinds = new Map(data.categories.map((c) => [c.id, c.kind]));
  const rows = useMemo(() => {
    const m = new Map<string, { root: string; total: number; count: number; txs: typeof data.transactions }>();
    for (const t of data.transactions) {
      if (!t.date.startsWith(month) || t.exchangeId) continue;
      const k = kinds.get(t.categoryId);
      if (k === 'transfer') continue;
      const isIncome = t.amount >= 0 && k !== 'expense';
      if ((kind === 'income') !== isIncome) continue;
      const root = rootOf(t.categoryId);
      const e = m.get(root) ?? { root, total: 0, count: 0, txs: [] };
      e.total += kind === 'income' ? txBase(data, t) : -txBase(data, t);
      e.count++;
      e.txs.push(t);
      m.set(root, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data, month, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((s, r) => s + r.total, 0);
  const name = (id: string) => data.categories.find((c) => c.id === id)?.name ?? id;
  if (!rows.length) return <p className="small muted center">No hay {kind === 'income' ? 'ingresos' : 'gastos'} este mes.</p>;
  return (
    <div className="card glass flush">
      <ul className="list plain">
        {rows.map((r) => {
          const isOpen = open === r.root;
          const subs = new Map<string, number>();
          for (const t of r.txs) subs.set(t.categoryId, (subs.get(t.categoryId) ?? 0) + (kind === 'income' ? txBase(data, t) : -txBase(data, t)));
          return (
            <li key={r.root} style={{ display: 'block', padding: 0 }}>
              <div className="row tap" style={{ padding: '12px 18px' }} onClick={() => setOpen(isOpen ? null : r.root)}>
                <CatBadge id={r.root} />
                <div className="grow">
                  <div className="ellipsis">{name(r.root)}</div>
                  <div className="track" style={{ height: 6, margin: '6px 0 2px', borderRadius: 9, background: 'var(--fill-2)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${total ? (r.total / total) * 100 : 0}%`, background: categoryColorOf(r.root) }} /></div>
                  <div className="tiny muted">{r.count} movimientos · {total ? Math.round((r.total / total) * 100) : 0} %</div>
                </div>
                <b className={`num ${kind === 'income' ? 'pos' : ''}`}>{formatMoney(r.total, base)}</b>
              </div>
              {isOpen && (
                <div style={{ padding: '0 18px 12px 18px', display: 'grid', gap: 10 }}>
                  {[...subs].sort((a, b) => b[1] - a[1]).map(([id, v]) => (
                    <div key={id}>
                      <div className="row small" style={{ justifyContent: 'space-between' }}><b>{id === r.root ? 'General' : name(id)}</b><span className="num">{formatMoney(v, base)}</span></div>
                      {r.txs.filter((t) => t.categoryId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((t) => (
                        <div key={t.id} className="row tiny muted" style={{ justifyContent: 'space-between', padding: '2px 0' }}><span className="ellipsis">{t.date.slice(8)}/{t.date.slice(5, 7)} · {prettyDescription(t.description)}</span><span className="num">{formatMoney(Math.abs(t.fx && t.fx.amount > 0 ? t.fx.amount : t.amount), t.fx && t.fx.amount > 0 ? t.fx.currency : data.accounts.find((a) => a.id === t.accountId)?.currency)}</span></div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const categoryColorOf = (id: string) => categoryColor(id);
