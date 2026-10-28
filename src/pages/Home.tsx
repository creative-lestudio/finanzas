import { useMemo } from 'react';
import { budgetStatus } from '../lib/budgets';
import { healthReport, netWorth } from '../lib/health';
import { detectAntExpenses, detectFees, detectSubscriptions, isActive, monthSummary } from '../lib/insights';
import { formatMoney, today } from '../lib/money';
import { applyGoalMovement, savingProposals } from '../lib/savings';
import { useStore } from '../store';
import { Bars, Money } from '../components/ui';
import type { Page } from '../App';

export function Home({ go }: { go: (p: Page) => void }) {
  const { data, update } = useStore();
  const now = today();
  const month = now.slice(0, 7);
  const day = Number(now.slice(8));

  const view = useMemo(() => {
    const sum = monthSummary(data, month);
    const subs = detectSubscriptions(data.transactions).filter((s) => s.kind === 'subscription' && isActive(s, now));
    return {
      sum,
      nw: netWorth(data),
      budgets: budgetStatus(data, month, day).filter((b) => b.state !== 'ok'),
      subs,
      raised: subs.filter((s) => s.priceIncrease),
      fees: detectFees(data.transactions).filter((f) => f.date.slice(0, 7) === month),
      ants: detectAntExpenses(data.transactions, now),
      proposals: savingProposals(data, month),
      health: healthReport(data, month, day),
    };
  }, [data, month, day, now]);

  const cat = (id: string) => data.categories.find((c) => c.id === id);
  const top = Object.entries(view.sum.byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, value]) => ({ label: `${cat(id)?.icon ?? ''} ${cat(id)?.name ?? id}`, value }));

  const acceptProposals = () => {
    update((d) => view.proposals.reduce((acc, p) => applyGoalMovement(acc, p.goalId, p.amount, p.reason, now), d));
  };

  const totalProposal = view.proposals.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <div className="card" onClick={() => go('wealth')} style={{ cursor: 'pointer' }}>
        <h2>Patrimonio neto</h2>
        <div className="big">{formatMoney(view.nw.net)}</div>
        <div className="row small muted wrap" style={{ marginTop: 4 }}>
          <span>Activos <Money cents={view.nw.assets} /></span>·<span>Deudas <Money cents={-view.nw.liabilities} /></span>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Ingresos del mes</h2>
          <Money cents={view.sum.income} className="pos" />
        </div>
        <div className="card">
          <h2>Gastos del mes</h2>
          <Money cents={view.sum.expenses} />
        </div>
      </div>

      {(view.budgets.length > 0 || view.raised.length > 0 || view.fees.length > 0) && (
        <div className="card">
          <h2>Avisos</h2>
          {view.budgets.map((b) => (
            <div key={b.budget.id} className={`alert ${b.state}`} onClick={() => go('plan')}>
              <span>{b.state === 'over' ? '✕' : '⚠'}</span>
              <div className="grow small">
                <b>{cat(b.budget.categoryId)?.name}</b>: {formatMoney(b.spent)} de {formatMoney(b.limit)} ({Math.round(b.ratio * 100)} %)
                {b.state === 'warning' && <div className="muted">Puedes gastar {formatMoney(b.dailyAllowance)}/día hasta fin de mes.</div>}
              </div>
            </div>
          ))}
          {view.raised.map((s) => (
            <div key={s.key} className="alert warning" onClick={() => go('subs')}>
              <span>↑</span>
              <div className="grow small"><b>{s.name}</b> ha subido {formatMoney(s.priceIncrease!)} en el último cobro.</div>
            </div>
          ))}
          {view.fees.length > 0 && (
            <div className="alert warning" onClick={() => go('subs')}>
              <span>🏦</span>
              <div className="grow small">
                Este mes has pagado <b>{formatMoney(view.fees.reduce((s, f) => s + f.amount, 0))}</b> en comisiones bancarias. Ver cómo evitarlas.
              </div>
            </div>
          )}
        </div>
      )}

      {view.proposals.length > 0 && (
        <div className="card">
          <h2>Ahorro automático</h2>
          <p className="small" style={{ marginTop: 0 }}>
            Puedes apartar <b>{formatMoney(totalProposal)}</b> este mes sin notarlo:
          </p>
          <ul className="list small">
            {view.proposals.map((p, i) => (
              <li key={i}>
                <span className="grow">{p.detail} → {data.goals.find((g) => g.id === p.goalId)?.name}</span>
                <Money cents={p.amount} />
              </li>
            ))}
          </ul>
          <button className="btn primary block" onClick={acceptProposals}>Apartar a mis huchas</button>
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h2>En qué se va el dinero</h2>
          <button className="btn ghost small" onClick={() => go('transactions')}>Ver todo</button>
        </div>
        {top.length ? <Bars rows={top} /> : <p className="muted small">Aún no hay gastos este mes.</p>}
      </div>

      {view.ants.byMerchant.length > 0 && (
        <div className="card">
          <h2>Gastos hormiga (30 días)</h2>
          <p className="small" style={{ marginTop: 0 }}>
            {view.ants.count} compras pequeñas suman <b>{formatMoney(view.ants.total)}</b>. Al año serían{' '}
            <b>{formatMoney(view.ants.yearly)}</b>.
          </p>
          <ul className="list small">
            {view.ants.byMerchant.slice(0, 4).map((m) => (
              <li key={m.key}>
                <span className="grow ellipsis">{m.name}</span>
                <span className="muted">{m.count}×</span>
                <Money cents={m.total} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row" style={{ gap: 12 }}>
        <div className="card grow" onClick={() => go('health')} style={{ cursor: 'pointer' }}>
          <h2>Salud financiera</h2>
          <div className="big">{view.health.score}<span className="small muted">/100</span></div>
          <div className="small muted">{view.health.grade}</div>
        </div>
        <div className="card grow" onClick={() => go('subs')} style={{ cursor: 'pointer' }}>
          <h2>Suscripciones</h2>
          <div className="big">{view.subs.length}</div>
          <div className="small muted">{formatMoney(view.subs.reduce((s, x) => s + x.yearly, 0))}/año</div>
        </div>
      </div>
    </>
  );
}
