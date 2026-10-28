import { useMemo } from 'react';
import type { Page } from '../App';
import { CatIcon, GoalIcon, Icon } from '../components/icons';
import { Money } from '../components/ui';
import { budgetStatus } from '../lib/budgets';
import { fxSummary } from '../lib/fx';
import { goalProgress, GOAL_STATUS_LABEL } from '../lib/goals';
import { healthReport, netWorth } from '../lib/health';
import { detectAntExpenses, detectFees, detectSubscriptions, isActive, monthSummary } from '../lib/insights';
import { addMonths, formatMoney, today } from '../lib/money';
import { applyGoalMovement, savingProposals } from '../lib/savings';
import { useStore } from '../store';

const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' });

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
      // Últimos 6 meses, sin los meses vacíos del principio (antes de empezar a usar la app).
      history: [5, 4, 3, 2, 1, 0].map((i) => monthSummary(data, addMonths(month, -i))).filter((_m, i, all) => i === all.length - 1 || all.slice(0, i + 1).some((x) => x.expenses > 0)),
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
    .slice(0, 5);
  const topMax = Math.max(1, ...top.map(([, v]) => v));
  const totalProposal = view.proposals.reduce((s, p) => s + p.amount, 0);
  const saved = view.sum.income - view.sum.expenses;
  const histMax = Math.max(1, ...view.history.map((m) => m.expenses));
  const delta = view.prev.expenses ? (view.sum.expenses - view.prev.expenses) / view.prev.expenses : 0;
  const alerts = view.budgets.length + view.raised.length + (view.fees.length ? 1 : 0);

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Patrimonio neto</div>
        <div className="big" onClick={() => go('wealth')} style={{ cursor: 'pointer' }}>{formatMoney(view.nw.net, base)}</div>
        <div className="hero-sub">
          <span>Este mes <b className={saved >= 0 ? 'pos' : 'negc'}>{saved >= 0 ? '+' : ''}{formatMoney(saved)}</b></span>
          <span>Deudas <b>{formatMoney(view.nw.liabilities)}</b></span>
        </div>
      </section>

      <div className="quick">
        {[
          ['mic', 'Dictar', openVoice],
          ['plus', 'Añadir', openAdd],
          ['swap', 'Cambio', () => go('fx')],
          ['sparkles', 'Asesor', () => go('assistant')],
        ].map(([icon, label, fn]) => (
          <button key={label as string} onClick={fn as () => void}>
            <span className="qi lg"><Icon name={icon as string} size={22} /></span>
            {label as string}
          </button>
        ))}
      </div>

      <div className="card glass">
        <div className="card-head">
          <h2>Gasto mensual</h2>
          <button className="link" onClick={() => go('transactions')}>Movimientos</button>
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
          <span className="big" style={{ fontSize: 30 }}>{formatMoney(view.sum.expenses)}</span>
          {view.prev.expenses > 0 && (
            <span className={`small ${delta > 0 ? 'negc' : 'pos'}`}>{delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)} % vs. mes anterior</span>
          )}
        </div>
        <div className="small muted">Ingresos {formatMoney(view.sum.income)}</div>
        <div className="cols" role="img" aria-label="Gasto de los últimos meses" style={{ gridTemplateColumns: `repeat(${view.history.length}, 1fr)` }}>
          {view.history.map((m, i) => (
            <div key={m.month} className={`col ${i === view.history.length - 1 ? 'now' : ''}`} title={`${m.month}: ${formatMoney(m.expenses)}`}>
              <div className="bar" style={{ height: `${(m.expenses / histMax) * 100}%` }} />
              <span>{MONTH_SHORT.format(new Date(`${m.month}-15`)).replace('.', '')}</span>
            </div>
          ))}
        </div>
      </div>

      {view.sum.missingRates.size > 0 && (
        <div className="alert warning small tap" onClick={() => go('fx')}>
          <Icon name="alert" size={18} />
          <div>Faltan tasas para {[...view.sum.missingRates].join(', ')}: esos movimientos no se suman. Escríbelas en Divisas.</div>
        </div>
      )}

      {alerts > 0 && (
        <>
          <div className="section-title">Avisos</div>
          <div className="card glass flush">
            <ul className="list">
              {view.budgets.map((b) => (
                <li key={b.budget.id} className="tap" onClick={() => go('plan')}>
                  <span className="icon" style={{ background: b.state === 'over' ? 'var(--bad-bg)' : 'var(--warn-bg)', color: b.state === 'over' ? 'var(--bad)' : 'var(--warn)' }}>
                    <CatIcon id={b.budget.categoryId} emoji={cat(b.budget.categoryId)?.icon} size={18} />
                  </span>
                  <div className="grow">
                    <div>{cat(b.budget.categoryId)?.name}</div>
                    <div className="small muted">{b.state === 'over' ? `Superado en ${formatMoney(-b.remaining)}` : `Quedan ${formatMoney(b.dailyAllowance)} al día`}</div>
                  </div>
                  <span className="small num secondary">{Math.round(b.ratio * 100)} %</span>
                </li>
              ))}
              {view.raised.map((s) => (
                <li key={s.key} className="tap" onClick={() => go('subs')}>
                  <span className="icon" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="arrowUp" size={18} /></span>
                  <div className="grow">
                    <div className="ellipsis">{s.name} ha subido</div>
                    <div className="small muted">+{formatMoney(s.priceIncrease!, s.currency)} en el último cobro</div>
                  </div>
                </li>
              ))}
              {view.fees.length > 0 && (
                <li className="tap" onClick={() => go('subs')}>
                  <span className="icon" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="bank" size={18} /></span>
                  <div className="grow">
                    <div>Comisiones bancarias</div>
                    <div className="small muted">{formatMoney(view.fees.reduce((s, f) => s + f.amountBase, 0))} este mes. Mira cómo evitarlas.</div>
                  </div>
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {(view.fx.exchanges.length > 0 || view.fx.incomes.length > 0) && (
        <div className="card glass" onClick={() => go('fx')} style={{ cursor: 'pointer', marginTop: 14 }}>
          <div className="card-head"><h2>Cambio de divisa · 3 meses</h2><Icon name="chevron" size={16} className="chev" /></div>
          <div className={`mid ${view.fx.total < 0 ? 'negc' : 'pos'}`}>{formatMoney(view.fx.total)}</div>
          <div className="small muted">Frente a tus tasas de referencia, comisiones incluidas.</div>
        </div>
      )}

      {top.length > 0 && (
        <div className="card glass" style={{ marginTop: 14 }}>
          <h2>En qué se va el dinero</h2>
          <div className="bars">
            {top.map(([id, value]) => (
              <div key={id} className="bar-row" title={`${cat(id)?.name}: ${formatMoney(value)}`}>
                <span className="row ellipsis" style={{ gap: 8 }}><span style={{ color: 'var(--accent-ink)' }}><CatIcon id={id} emoji={cat(id)?.icon} size={16} /></span>{cat(id)?.name ?? id}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(value / topMax) * 100}%` }} /></div>
                <Money cents={value} className="small" />
              </div>
            ))}
          </div>
        </div>
      )}

      {view.proposals.length > 0 && (
        <div className="card glass">
          <h2>Ahorro automático</h2>
          <p className="small secondary" style={{ marginTop: 0 }}>Puedes apartar <b>{formatMoney(totalProposal)}</b> este mes sin notarlo.</p>
          <ul className="list plain small">
            {view.proposals.map((p, i) => (
              <li key={i} style={{ minHeight: 44 }}>
                <span className="grow">{p.detail} <span className="muted">· {data.goals.find((g) => g.id === p.goalId)?.name}</span></span>
                <Money cents={p.amount} />
              </li>
            ))}
          </ul>
          <button className="btn primary block mt" onClick={() => update((d) => view.proposals.reduce((acc, p) => applyGoalMovement(acc, p.goalId, p.amount, p.reason, now), d))}>Apartar a mis huchas</button>
        </div>
      )}

      {view.goals.length > 0 && (
        <div className="card glass" onClick={() => go('plan')} style={{ cursor: 'pointer' }}>
          <div className="card-head"><h2>Metas</h2><Icon name="chevron" size={16} className="chev" /></div>
          <div className="stack">
            {view.goals.map((p) => (
              <div key={p.goal.id}>
                <div className="row between small" style={{ marginBottom: 8 }}>
                  <span className="row ellipsis" style={{ gap: 8 }}><span style={{ color: 'var(--accent-ink)' }}><GoalIcon icon={p.goal.icon} size={17} /></span>{p.goal.name}</span>
                  <span className={`badge ${p.status}`}>{GOAL_STATUS_LABEL[p.status]}</span>
                </div>
                <div className="meter"><div style={{ width: `${p.ratio * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.ants.byMerchant.length > 0 && (
        <div className="card glass">
          <h2>Gastos hormiga · 30 días</h2>
          <p className="small secondary" style={{ marginTop: 0 }}>
            {view.ants.count} compras pequeñas suman <b>{formatMoney(view.ants.total)}</b>: unos <b>{formatMoney(view.ants.yearly)}</b> al año.
          </p>
          <ul className="list plain small">
            {view.ants.byMerchant.slice(0, 3).map((m) => (
              <li key={m.key} style={{ minHeight: 44 }}>
                <span className="grow ellipsis">{m.name}</span>
                <span className="muted">{m.count} veces</span>
                <Money cents={m.total} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid2">
        <div className="card glass" onClick={() => go('health')} style={{ cursor: 'pointer' }}>
          <div className="eyebrow">Salud financiera</div>
          <div className="big" style={{ fontSize: 30, marginTop: 4 }}>{view.health.score}<span className="small muted"> /100</span></div>
          <div className="small secondary">{view.health.grade}</div>
        </div>
        <div className="card glass" onClick={() => go('subs')} style={{ cursor: 'pointer' }}>
          <div className="eyebrow">Suscripciones</div>
          <div className="big" style={{ fontSize: 30, marginTop: 4 }}>{view.subs.length}</div>
          <div className="small secondary">{formatMoney(view.subs.reduce((s, x) => s + x.yearlyBase, 0))} al año</div>
        </div>
      </div>
    </>
  );
}
