import { useMemo } from 'react';
import type { Page } from '../App';
import { Icon } from '../components/icons';
import { Bars, Money } from '../components/ui';
import { budgetStatus } from '../lib/budgets';
import { fxSummary } from '../lib/fx';
import { goalProgress, GOAL_STATUS_LABEL } from '../lib/goals';
import { healthReport, netWorth } from '../lib/health';
import { detectAntExpenses, detectFees, detectSubscriptions, isActive, monthSummary } from '../lib/insights';
import { addMonths, formatMoney, today } from '../lib/money';
import { applyGoalMovement, savingProposals } from '../lib/savings';
import { useStore } from '../store';

export function Home({ go, openVoice, openAdd }: { go: (p: Page) => void; openVoice: () => void; openAdd: () => void }) {
  const { data, update } = useStore();
  const now = today();
  const month = now.slice(0, 7);
  const day = Number(now.slice(8));
  const base = data.settings.currency;

  const view = useMemo(() => {
    const sum = monthSummary(data, month);
    const subs = detectSubscriptions(data).filter((s) => s.kind === 'subscription' && isActive(s, now));
    return {
      sum,
      prev: monthSummary(data, addMonths(month, -1)),
      nw: netWorth(data),
      budgets: budgetStatus(data, month, day).filter((b) => b.state !== 'ok'),
      subs,
      raised: subs.filter((s) => s.priceIncrease),
      fees: detectFees(data).filter((f) => f.date.slice(0, 7) === month),
      ants: detectAntExpenses(data, now),
      proposals: savingProposals(data, month),
      health: healthReport(data, month, day),
      fx: fxSummary(data, addMonths(month, -2)),
      goals: data.goals.map((g) => goalProgress(data, g)).slice(0, 3),
    };
  }, [data, month, day, now]);

  const cat = (id: string) => data.categories.find((c) => c.id === id);
  const top = Object.entries(view.sum.byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, value]) => ({ label: `${cat(id)?.icon ?? ''} ${cat(id)?.name ?? id}`, value }));
  const totalProposal = view.proposals.reduce((s, p) => s + p.amount, 0);
  const savedThisMonth = view.sum.income - view.sum.expenses;

  return (
    <>
      <div className="hero glass" onClick={() => go('wealth')} style={{ cursor: 'pointer' }}>
        <div className="small secondary">Patrimonio neto</div>
        <div className="big" style={{ fontSize: 42, margin: '2px 0 6px' }}>{formatMoney(view.nw.net, base)}</div>
        <div className="row small secondary wrap" style={{ gap: 14 }}>
          <span>Activos <Money cents={view.nw.assets} /></span>
          <span>Deudas <Money cents={-view.nw.liabilities} /></span>
        </div>
      </div>

      <div className="quick">
        <button className="glass" onClick={openVoice}><span className="qi"><Icon name="mic" size={20} /></span>Dictar</button>
        <button className="glass" onClick={openAdd}><span className="qi"><Icon name="plus" size={20} /></span>Añadir</button>
        <button className="glass" onClick={() => go('fx')}><span className="qi"><Icon name="swap" size={20} /></span>Cambio</button>
        <button className="glass" onClick={() => go('assistant')}><span className="qi"><Icon name="sparkles" size={20} /></span>Asesor</button>
      </div>

      <div className="grid2 mb">
        <div className="card glass">
          <h2>Ingresos</h2>
          <div className="mid pos">{formatMoney(view.sum.income)}</div>
          <div className="tiny muted">mes anterior {formatMoney(view.prev.income)}</div>
        </div>
        <div className="card glass">
          <h2>Gastos</h2>
          <div className="mid">{formatMoney(view.sum.expenses)}</div>
          <div className="tiny muted">mes anterior {formatMoney(view.prev.expenses)}</div>
        </div>
      </div>
      {view.sum.missingRates.size > 0 && (
        <div className="alert warning small tap" onClick={() => go('fx')}>
          ⚠ Faltan tasas de cambio para {[...view.sum.missingRates].join(', ')}: esos movimientos no se suman. Añádelas en Divisas.
        </div>
      )}

      {(view.budgets.length > 0 || view.raised.length > 0 || view.fees.length > 0) && (
        <div className="card glass">
          <h2>Avisos</h2>
          {view.budgets.map((b) => (
            <div key={b.budget.id} className={`alert tap ${b.state}`} onClick={() => go('plan')}>
              <span>{b.state === 'over' ? '✕' : '⚠'}</span>
              <div className="grow small">
                <b>{cat(b.budget.categoryId)?.name}</b>: {formatMoney(b.spent)} de {formatMoney(b.limit)} ({Math.round(b.ratio * 100)} %)
                {b.state === 'warning' && <div className="muted">Te quedan {formatMoney(b.dailyAllowance)}/día hasta fin de mes.</div>}
              </div>
            </div>
          ))}
          {view.raised.map((s) => (
            <div key={s.key} className="alert tap warning" onClick={() => go('subs')}>
              <span>↑</span>
              <div className="grow small"><b>{s.name}</b> ha subido {formatMoney(s.priceIncrease!, s.currency)} en el último cobro.</div>
            </div>
          ))}
          {view.fees.length > 0 && (
            <div className="alert tap warning" onClick={() => go('subs')}>
              <span>🏦</span>
              <div className="grow small">Este mes has pagado <b>{formatMoney(view.fees.reduce((s, f) => s + f.amountBase, 0))}</b> en comisiones bancarias.</div>
            </div>
          )}
        </div>
      )}

      {(view.fx.exchanges.length > 0 || view.fx.incomes.length > 0) && (
        <div className="card glass" onClick={() => go('fx')} style={{ cursor: 'pointer' }}>
          <div className="card-head"><h2>Pérdida por cambio · 3 meses</h2><Icon name="chevron" size={16} className="chev" /></div>
          <div className={`mid ${view.fx.total < 0 ? 'negc' : 'pos'}`}>{formatMoney(view.fx.total)}</div>
          <div className="small muted">Frente a la tasa de mercado, incluidas comisiones ({formatMoney(view.fx.fees)} explícitas).</div>
        </div>
      )}

      {view.proposals.length > 0 && (
        <div className="card glass">
          <h2>Ahorro automático</h2>
          <p className="small" style={{ marginTop: 0 }}>Puedes apartar <b>{formatMoney(totalProposal)}</b> este mes sin notarlo:</p>
          <ul className="list small">
            {view.proposals.map((p, i) => (
              <li key={i}>
                <span className="grow">{p.detail} → {data.goals.find((g) => g.id === p.goalId)?.name}</span>
                <Money cents={p.amount} />
              </li>
            ))}
          </ul>
          <button className="btn primary block" onClick={() => update((d) => view.proposals.reduce((acc, p) => applyGoalMovement(acc, p.goalId, p.amount, p.reason, now), d))}>Apartar a mis huchas</button>
        </div>
      )}

      <div className="card glass">
        <div className="card-head">
          <h2>En qué se va el dinero</h2>
          <button className="link" onClick={() => go('transactions')}>Ver todo</button>
        </div>
        {top.length ? <Bars rows={top} /> : <p className="small muted">Aún no hay gastos este mes.</p>}
        <p className="small muted" style={{ marginBottom: 0 }}>
          {savedThisMonth >= 0 ? <>Este mes llevas ahorrado <b className="pos">{formatMoney(savedThisMonth)}</b>.</> : <>Este mes gastas <b className="negc">{formatMoney(-savedThisMonth)}</b> más de lo que ingresas.</>}
        </p>
      </div>

      {view.goals.length > 0 && (
        <div className="card glass" onClick={() => go('plan')} style={{ cursor: 'pointer' }}>
          <div className="card-head"><h2>Metas</h2><Icon name="chevron" size={16} className="chev" /></div>
          {view.goals.map((p) => (
            <div key={p.goal.id} className="mb">
              <div className="row between small" style={{ marginBottom: 6 }}>
                <span className="ellipsis">{p.goal.icon} {p.goal.name}</span>
                <span className={`badge ${p.status}`}>{GOAL_STATUS_LABEL[p.status]}</span>
              </div>
              <div className="meter"><div style={{ width: `${p.ratio * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      {view.ants.byMerchant.length > 0 && (
        <div className="card glass">
          <h2>Gastos hormiga · 30 días</h2>
          <p className="small" style={{ marginTop: 0 }}>
            {view.ants.count} compras pequeñas suman <b>{formatMoney(view.ants.total)}</b>. Al año serían <b>{formatMoney(view.ants.yearly)}</b>.
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

      <div className="grid2">
        <div className="card glass" onClick={() => go('health')} style={{ cursor: 'pointer' }}>
          <h2>Salud</h2>
          <div className="big">{view.health.score}<span className="small muted">/100</span></div>
          <div className="small muted">{view.health.grade}</div>
        </div>
        <div className="card glass" onClick={() => go('subs')} style={{ cursor: 'pointer' }}>
          <h2>Suscripciones</h2>
          <div className="big">{view.subs.length}</div>
          <div className="small muted">{formatMoney(view.subs.reduce((s, x) => s + x.yearlyBase, 0))}/año</div>
        </div>
      </div>
    </>
  );
}
