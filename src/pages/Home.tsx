import { useMemo, useRef, useState } from 'react';
import type { Page } from '../App';
import { COACH } from '../components/Coach';
import { Setup } from '../components/Setup';
import { CatBadge, GoalIcon, Icon } from '../components/icons';
import { Money } from '../components/ui';
import { budgetStatus } from '../lib/budgets';
import { coachTip } from '../lib/coach';
import { spendByFamily } from '../lib/families';
import { fxSummary, toBase } from '../lib/fx';
import { goalProgress, GOAL_STATUS_LABEL } from '../lib/goals';
import { healthReport, netWorth } from '../lib/health';
import { detectAntExpenses, detectFees, detectSubscriptions, isActive, monthSummary } from '../lib/insights';
import { addMonths, formatMoney, today } from '../lib/money';
import { applyGoalMovement, savingProposals } from '../lib/savings';
import type { Account } from '../lib/types';
import { useStore } from '../store';
import { askAdvisor } from './Assistant';

const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' });

const KIND_NAME: Record<Account['kind'], string> = {
  checking: 'Cuenta', savings: 'Ahorro', cash: 'Efectivo', investment: 'Inversión', crypto: 'Cripto', card: 'Tarjeta', loan: 'Préstamo',
};

export function Home({ go, openVoice, openAdd, hidden }: { go: (p: Page) => void; openVoice: () => void; openAdd: () => void; hidden: boolean }) {
  const { data, update } = useStore();
  const now = today();
  const month = now.slice(0, 7);
  const day = Number(now.slice(8));
  const base = data.settings.currency;
  const [slide, setSlide] = useState(0);
  const carousel = useRef<HTMLDivElement>(null);

  const view = useMemo(() => {
    const sum = monthSummary(data, month);
    const subs = detectSubscriptions(data).filter((s) => s.kind === 'subscription' && isActive(s, now));
    const inBase = (a: Account) => toBase(data, a.balance, a.currency, now);
    const liquidAccounts = data.accounts.filter((a) => ['checking', 'savings', 'cash'].includes(a.kind)).sort((a, b) => inBase(b) - inBase(a));
    const investAccounts = data.accounts.filter((a) => a.kind === 'investment' || a.kind === 'crypto').sort((a, b) => inBase(b) - inBase(a));
    return {
      sum,
      prev: monthSummary(data, addMonths(month, -1)),
      // Últimos 6 meses, sin los meses vacíos del principio (antes de empezar a usar la app).
      history: [5, 4, 3, 2, 1, 0].map((i) => monthSummary(data, addMonths(month, -i))).filter((_m, i, all) => i === all.length - 1 || all.slice(0, i + 1).some((x) => x.expenses > 0)),
      nw: netWorth(data),
      liquidAccounts,
      investAccounts,
      investTotal: investAccounts.reduce((s, a) => s + inBase(a), 0),
      currencies: [...new Set(liquidAccounts.map((a) => a.currency))],
      families: spendByFamily(sum.byCategory),
      budgets: budgetStatus(data, month, day).filter((b) => b.state !== 'ok'),
      subs,
      raised: subs.filter((s) => s.priceIncrease),
      fees: detectFees(data).filter((f) => f.date.slice(0, 7) === month),
      ants: detectAntExpenses(data, now),
      proposals: savingProposals(data, month),
      health: healthReport(data, month, day),
      fx: fxSummary(data, addMonths(month, -2)),
      goals: data.goals.map((g) => goalProgress(data, g)).slice(0, 3),
      tip: coachTip(data, month, day),
      investGoals: data.goals.filter((g) => g.kind === 'investment').map((g) => goalProgress(data, g)),
    };
  }, [data, month, day, now]);

  const cat = (id: string) => data.categories.find((c) => c.id === id);
  const totalProposal = view.proposals.reduce((s, p) => s + p.amount, 0);
  const saved = view.sum.income - view.sum.expenses;
  const histMax = Math.max(1, ...view.history.map((m) => m.expenses));
  const delta = view.prev.expenses ? (view.sum.expenses - view.prev.expenses) / view.prev.expenses : 0;
  const alerts = view.budgets.length + view.raised.length + (view.fees.length ? 1 : 0);
  const famTotal = view.families.reduce((s, f) => s + f.value, 0);

  const onScroll = () => {
    const el = carousel.current;
    if (el) setSlide(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goSlide = (i: number) => carousel.current?.scrollTo({ left: i * carousel.current.clientWidth, behavior: 'smooth' });

  const accountRow = (a: Account) => (
    <div key={a.id}>
      <span className="pill">{a.currency}</span>
      <span className="ellipsis">{a.name}</span>
      <span className="v">{formatMoney(a.balance, a.currency)}</span>
    </div>
  );

  const needsSetup = !data.settings.onboarded && data.transactions.length === 0 && data.accounts.length <= 1;

  return (
    <>
      {needsSetup && <Setup />}
      {/* Tarjetas deslizables: patrimonio, posición global y inversiones */}
      <div className="carousel" ref={carousel} onScroll={onScroll} aria-label="Tus saldos">
        <section className="balance b1" onClick={() => go('wealth')} aria-label="Patrimonio neto">
          <div className="label"><Icon name="chart" size={16} /> Patrimonio neto</div>
          <div className="amount">{formatMoney(view.nw.net, base)}</div>
          <div className="meta">Lo que tienes menos lo que debes</div>
          <div className="rows">
            <div><span>Activos</span><span className="v">{formatMoney(view.nw.assets)}</span></div>
            <div><span>Deudas</span><span className="v">{view.nw.liabilities ? "−" : ""}{formatMoney(view.nw.liabilities)}</span></div>
            <div><span>Este mes</span><span className="v">{saved >= 0 ? '+' : ''}{formatMoney(saved)}</span></div>
          </div>
        </section>
        <section className="balance b2" onClick={() => go('wealth')} aria-label="Posición global">
          <div className="label"><Icon name="wallet" size={16} /> Posición global · disponible</div>
          <div className="amount">{formatMoney(view.nw.liquid, base)}</div>
          <div className="meta">En {view.liquidAccounts.length} cuentas · {view.currencies.join(', ')}</div>
          <div className="rows">{view.liquidAccounts.slice(0, 4).map(accountRow)}</div>
        </section>
        <section className="balance b3" onClick={() => go('wealth')} aria-label="Inversiones">
          <div className="label"><Icon name="trend" size={16} /> Inversiones</div>
          <div className="amount">{formatMoney(view.investTotal, base)}</div>
          <div className="meta">
            {view.investGoals[0] ? `${Math.round(view.investGoals[0].ratio * 100)} % de «${view.investGoals[0].goal.name}»` : `${view.investAccounts.length} posiciones`}
          </div>
          <div className="rows">
            {view.investAccounts.length ? view.investAccounts.slice(0, 4).map((a) => (
              <div key={a.id}><span className="pill">{KIND_NAME[a.kind]}</span><span className="ellipsis">{a.name}</span><span className="v">{formatMoney(a.balance, a.currency)}</span></div>
            )) : <div><span>Añade fondos, acciones o cripto en Patrimonio</span></div>}
          </div>
        </section>
      </div>
      <div className="dots" role="tablist" aria-label="Elegir tarjeta">
        {['Patrimonio', 'Posición global', 'Inversiones'].map((l, i) => (
          <button key={l} className={slide === i ? 'on' : ''} onClick={() => goSlide(i)} aria-label={l} aria-selected={slide === i} role="tab" />
        ))}
      </div>

      <div className="quick">
        {([
          ['mic', 'Dictar', openVoice],
          ['plus', 'Añadir', openAdd],
          ['swap', 'Cambio', () => go('fx')],
          ['sparkles', 'Asesor', () => go('assistant')],
        ] as const).map(([icon, label, fn]) => (
          <button key={label} onClick={fn}>
            <span className="qi lg"><Icon name={icon} size={22} /></span>
            {label}
          </button>
        ))}
      </div>

      {/* El asistente comenta tus números */}
      <div className="insight glass" onClick={() => { askAdvisor(view.tip.ask); go('assistant'); }} role="button" tabIndex={0}>
        <img src={COACH[view.tip.pose]} alt="" />
        <div className="txt">
          <b>{view.tip.title}</b>
          <div>{hidden ? 'Toca para hablar con tu asistente.' : view.tip.text}</div>
        </div>
      </div>

      <div className="card glass" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>Este mes</h2>
          <button className="link" onClick={() => go('transactions')}>Movimientos</button>
        </div>
        <div className="grid2" style={{ gap: 10 }}>
          <div>
            <div className="eyebrow row" style={{ gap: 6 }}><Icon name="arrowDown" size={14} /> Ingresos</div>
            <div className="mid pos">{formatMoney(view.sum.income)}</div>
          </div>
          <div>
            <div className="eyebrow row" style={{ gap: 6 }}><Icon name="arrowUp" size={14} /> Gastos</div>
            <div className="mid neg">{formatMoney(view.sum.expenses)}</div>
          </div>
        </div>
        {view.prev.expenses > 0 && (
          <div className={`small ${delta > 0 ? 'neg' : 'pos'}`} style={{ marginTop: 6 }}>{delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)} % de gasto frente al mes anterior</div>
        )}
        {view.families.length > 0 && (
          <>
            <div className="segbar" role="img" aria-label="Gasto del mes por grupo">
              {view.families.map((f) => <i key={f.family.id} style={{ ['--c' as string]: f.family.color, flexGrow: f.value }} title={`${f.family.label}: ${formatMoney(f.value)}`} />)}
            </div>
            <div className="legend">
              {view.families.map((f) => (
                <div key={f.family.id}>
                  <span className="cat-dot" style={{ ['--c' as string]: f.family.color }} />
                  <span className="ellipsis">{f.family.label}</span>
                  <span className="v">{hidden ? '••' : `${Math.round((f.value / famTotal) * 100)} %`}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="cols" role="img" aria-label="Gasto de los últimos meses" style={{ gridTemplateColumns: `repeat(${view.history.length}, 1fr)`, marginTop: 18 }}>
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
                  <CatBadge id={b.budget.categoryId} emoji={cat(b.budget.categoryId)?.icon} size={18} />
                  <div className="grow">
                    <div>{cat(b.budget.categoryId)?.name}</div>
                    <div className={`small ${b.state === 'over' ? 'neg' : 'muted'}`}>{b.state === 'over' ? `Superado en ${formatMoney(-b.remaining)}` : `Quedan ${formatMoney(b.dailyAllowance)} al día`}</div>
                  </div>
                  <span className={`badge ${b.state}`}>{Math.round(b.ratio * 100)} %</span>
                </li>
              ))}
              {view.raised.map((s) => (
                <li key={s.key} className="tap" onClick={() => go('subs')}>
                  <span className="icon" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="arrowUp" size={18} /></span>
                  <div className="grow">
                    <div className="ellipsis">{s.name} ha subido</div>
                    <div className="small neg">+{formatMoney(s.priceIncrease!, s.currency)} en el último cobro</div>
                  </div>
                </li>
              ))}
              {view.fees.length > 0 && (
                <li className="tap" onClick={() => go('subs')}>
                  <span className="icon" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}><Icon name="bank" size={18} /></span>
                  <div className="grow">
                    <div>Comisiones bancarias</div>
                    <div className="small muted"><span className="neg">{formatMoney(view.fees.reduce((s, f) => s + f.amountBase, 0))}</span> este mes. Mira cómo evitarlas.</div>
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
          <div className={`mid ${view.fx.total < 0 ? 'neg' : 'pos'}`}>{formatMoney(view.fx.total)}</div>
          <div className="small muted">Frente a tus tasas de referencia, comisiones incluidas.</div>
        </div>
      )}

      {view.proposals.length > 0 && (
        <div className="card glass" style={{ marginTop: 14 }}>
          <h2>Ahorro automático</h2>
          <p className="small secondary" style={{ marginTop: 0 }}>Puedes apartar <b className="pos">{formatMoney(totalProposal)}</b> este mes sin notarlo.</p>
          <ul className="list plain small">
            {view.proposals.map((p, i) => (
              <li key={i} style={{ minHeight: 44 }}>
                <span className="grow">{p.detail} <span className="muted">· {data.goals.find((g) => g.id === p.goalId)?.name}</span></span>
                <Money cents={p.amount} tone="income" />
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
                <div className={`meter ${p.status === 'behind' ? 'warning' : p.status === 'done' || p.status === 'ahead' ? 'ok' : ''}`}><div style={{ width: `${p.ratio * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.ants.byMerchant.length > 0 && (
        <div className="card glass">
          <h2>Gastos hormiga · 30 días</h2>
          <p className="small secondary" style={{ marginTop: 0 }}>
            {view.ants.count} compras pequeñas suman <b className="neg">{formatMoney(view.ants.total)}</b>: unos <b className="neg">{formatMoney(view.ants.yearly)}</b> al año.
          </p>
          <ul className="list plain small">
            {view.ants.byMerchant.slice(0, 3).map((m) => (
              <li key={m.key} style={{ minHeight: 44 }}>
                <span className="grow ellipsis">{m.name}</span>
                <span className="muted">{m.count} veces</span>
                <Money cents={-m.total} sign />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid2">
        <div className="card glass" onClick={() => go('health')} style={{ cursor: 'pointer' }}>
          <div className="eyebrow">Salud financiera</div>
          <div className="big" style={{ fontSize: 30, marginTop: 4, color: view.health.score >= 60 ? 'var(--good)' : view.health.score >= 40 ? 'var(--warn)' : 'var(--bad)' }}>
            {view.health.score}<span className="small muted"> /100</span>
          </div>
          <div className="small secondary">{view.health.grade}</div>
        </div>
        <div className="card glass" onClick={() => go('subs')} style={{ cursor: 'pointer' }}>
          <div className="eyebrow">Suscripciones</div>
          <div className="big" style={{ fontSize: 30, marginTop: 4 }}>{view.subs.length}</div>
          <div className="small secondary"><span className="neg">{formatMoney(view.subs.reduce((s, x) => s + x.yearlyBase, 0))}</span> al año</div>
        </div>
      </div>
    </>
  );
}
