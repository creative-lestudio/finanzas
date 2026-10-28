import { useState } from 'react';
import { Icon } from '../components/icons';
import { Empty, Field, Meter, Money, Segmented, Sheet, StateBadge, Switch } from '../components/ui';
import { budgetStatus, suggestBudgets } from '../lib/budgets';
import { CURRENCIES } from '../lib/fx';
import { futureValue, goalProgress, GOAL_KIND_LABEL, GOAL_STATUS_LABEL } from '../lib/goals';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import { applyGoalMovement, safeToSave } from '../lib/savings';
import type { Budget, Goal, GoalKind } from '../lib/types';
import { useStore } from '../store';

export function Plan() {
  const { data, update } = useStore();
  const now = today();
  const month = now.slice(0, 7);
  const [tab, setTab] = useState<'budgets' | 'goals' | 'auto'>('budgets');
  const [editBudget, setEditBudget] = useState<Partial<Budget> | null>(null);
  const [editGoal, setEditGoal] = useState<Partial<Goal> | null>(null);
  const [moveGoal, setMoveGoal] = useState<Goal | null>(null);

  const statuses = budgetStatus(data, month, Number(now.slice(8)));
  const suggestions = suggestBudgets(data, month);
  const cat = (id: string) => data.categories.find((c) => c.id === id);
  const r = data.savingsRules;
  const totalBudget = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);

  return (
    <>
      <Segmented value={tab} onChange={setTab} options={[['budgets', 'Presupuestos'], ['goals', 'Metas'], ['auto', 'Automático']]} />

      {tab === 'budgets' && (
        <>
          {statuses.length > 0 && (
            <div className="hero glass">
              <div className="small secondary">Gastado este mes en categorías con tope</div>
              <div className="big">{formatMoney(totalSpent)} <span className="small muted">de {formatMoney(totalBudget)}</span></div>
              <div className="mt"><Meter ratio={totalBudget ? totalSpent / totalBudget : 0} state={totalSpent > totalBudget ? 'over' : totalSpent > totalBudget * 0.8 ? 'warning' : 'ok'} label="Presupuesto total" /></div>
            </div>
          )}
          {statuses.length === 0 && <Empty>Sin presupuestos todavía. Crea uno, acepta una sugerencia o pídeselos al asesor.</Empty>}
          {statuses.map((s) => (
            <div className="card glass" key={s.budget.id} onClick={() => setEditBudget(s.budget)} style={{ cursor: 'pointer' }}>
              <div className="row between mb">
                <b>{cat(s.budget.categoryId)?.icon} {cat(s.budget.categoryId)?.name}</b>
                <StateBadge state={s.state} />
              </div>
              <Meter ratio={s.ratio} state={s.state} label={`Gastado ${Math.round(s.ratio * 100)} %`} />
              <div className="row between small" style={{ marginTop: 8 }}>
                <span><Money cents={s.spent} /> <span className="muted">de</span> <Money cents={s.limit} /></span>
                <span className="muted">{s.remaining >= 0 ? `${formatMoney(s.dailyAllowance)}/día` : `${formatMoney(-s.remaining)} de más`}</span>
              </div>
              {s.projected > s.limit && s.state !== 'over' && <div className="small" style={{ marginTop: 6, color: 'var(--warn)' }}>⚠ Al ritmo actual acabarás el mes en {formatMoney(s.projected)}.</div>}
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="card glass">
              <h2>Sugerencias según tu gasto medio</h2>
              <ul className="list">
                {suggestions.slice(0, 5).map((s) => (
                  <li key={s.categoryId}>
                    <span className="grow">{cat(s.categoryId)?.icon} {cat(s.categoryId)?.name}</span>
                    <Money cents={s.limit} />
                    <button className="btn sm tinted" onClick={() => update((d) => ({ ...d, budgets: [...d.budgets, { id: uid(), categoryId: s.categoryId, limit: s.limit, warnAt: 0.8, rollover: false }] }))}>Añadir</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn block glass" onClick={() => setEditBudget({ warnAt: 0.8, rollover: false })}><Icon name="plus" size={18} /> Nuevo presupuesto</button>
        </>
      )}

      {tab === 'goals' && (
        <>
          {data.goals.length === 0 && <Empty>Crea metas medibles: una cifra, una fecha y un plan mensual. Ahorro, inversión, compras o pagar deudas.</Empty>}
          {[...data.goals].sort((a, b) => a.priority - b.priority).map((g) => {
            const p = goalProgress(data, g, now);
            return (
              <div className="card glass" key={g.id}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div className="grow" onClick={() => setEditGoal(g)} style={{ cursor: 'pointer' }}>
                    <div className="tiny muted">{GOAL_KIND_LABEL[g.kind ?? 'savings']}{g.accountIds?.length ? ' · medida con saldo de cuentas' : ''}</div>
                    <b style={{ fontSize: 18 }}>{g.icon} {g.name}</b>
                  </div>
                  <span className={`badge ${p.status}`}>{GOAL_STATUS_LABEL[p.status]}</span>
                </div>
                <div className="row between mt" style={{ alignItems: 'baseline' }}>
                  <span className="mid">{formatMoney(p.current, p.currency)}</span>
                  <span className="small muted">de {formatMoney(g.target, p.currency)} · {Math.round(p.ratio * 100)} %</span>
                </div>
                <div className="mt"><Meter ratio={p.ratio} state="goal" mark={p.expectedRatio} label={`${g.name}: ${Math.round(p.ratio * 100)} %`} /></div>
                <div className="kv small mt">
                  {g.deadline && <><span className="muted">Fecha límite</span><span>{g.deadline} · {p.monthsLeft} meses</span></>}
                  {p.requiredMonthly !== null && p.requiredMonthly > 0 && <><span className="muted">Necesitas al mes</span><b>{formatMoney(p.requiredMonthly, p.currency)}</b></>}
                  {g.monthlyPlan ? <><span className="muted">Plan mensual</span><span>{formatMoney(g.monthlyPlan, p.currency)}</span></> : null}
                  <span className="muted">Aportas de media</span><span>{formatMoney(p.actualMonthly, p.currency)}/mes</span>
                  {p.projectedDate && p.status !== 'done' && <><span className="muted">Al ritmo actual</span><span>la logras en {p.projectedDate.slice(0, 7)}</span></>}
                  {g.kind === 'investment' && p.projectedAtDeadline !== null && <><span className="muted">Proyección a la fecha ({g.expectedReturn ?? 0} %/año)</span><span>{formatMoney(p.projectedAtDeadline, p.currency)}</span></>}
                </div>
                {!g.accountIds?.length && (
                  <button className="btn tinted block mt" onClick={() => setMoveGoal(g)}>Aportar / retirar</button>
                )}
              </div>
            );
          })}
          <button className="btn block glass" onClick={() => setEditGoal({ icon: '🐷', kind: 'savings', priority: data.goals.length + 1 })}><Icon name="plus" size={18} /> Nueva meta</button>
        </>
      )}

      {tab === 'auto' && (
        <div className="card glass">
          <h2>Ahorro automático</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Cada mes la app calcula cuánto puedes apartar y lo reparte entre tus huchas por prioridad. Tú lo confirmas desde Inicio.</p>
          <Switch checked={r.enabled} onChange={(v) => update((d) => ({ ...d, savingsRules: { ...r, enabled: v } }))}>Activar ahorro automático</Switch>
          <Switch checked={r.roundUp} disabled={!r.enabled} onChange={(v) => update((d) => ({ ...d, savingsRules: { ...r, roundUp: v } }))}>Redondear compras al euro</Switch>
          <Switch checked={r.smartSave} disabled={!r.enabled} onChange={(v) => update((d) => ({ ...d, savingsRules: { ...r, smartSave: v } }))}>Ahorro inteligente según mis hábitos</Switch>
          <Field label={`Porcentaje de cada ingreso: ${r.percentOfIncome} %`}>
            <input type="range" min={0} max={30} value={r.percentOfIncome} disabled={!r.enabled} onChange={(e) => update((d) => ({ ...d, savingsRules: { ...r, percentOfIncome: Number(e.target.value) } }))} />
          </Field>
          <div className="alert good small">
            <span>💡</span>
            <div>Según tus últimos 3 meses, puedes apartar con seguridad unos <b>{formatMoney(safeToSave(data, month))}</b> este mes, dejando un colchón del 10 % de tus ingresos.</div>
          </div>
        </div>
      )}

      {editBudget && (
        <Sheet title={editBudget.id ? 'Editar presupuesto' : 'Nuevo presupuesto'} onClose={() => setEditBudget(null)}>
          <BudgetForm
            value={editBudget}
            onSave={(b) => {
              update((d) => ({ ...d, budgets: b.id && d.budgets.some((x) => x.id === b.id) ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, { ...b, id: uid() }] }));
              setEditBudget(null);
            }}
            onDelete={editBudget.id ? () => { update((d) => ({ ...d, budgets: d.budgets.filter((x) => x.id !== editBudget.id) })); setEditBudget(null); } : undefined}
          />
        </Sheet>
      )}
      {editGoal && (
        <Sheet title={editGoal.id ? 'Editar meta' : 'Nueva meta'} onClose={() => setEditGoal(null)}>
          <GoalForm
            value={editGoal}
            onSave={(g) => {
              update((d) => ({ ...d, goals: g.id && d.goals.some((x) => x.id === g.id) ? d.goals.map((x) => (x.id === g.id ? g : x)) : [...d.goals, { ...g, id: uid() }] }));
              setEditGoal(null);
            }}
            onDelete={editGoal.id ? () => { update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== editGoal.id) })); setEditGoal(null); } : undefined}
          />
        </Sheet>
      )}
      {moveGoal && (
        <Sheet title={`${moveGoal.icon} ${moveGoal.name}`} onClose={() => setMoveGoal(null)}>
          <GoalMove currency={moveGoal.currency ?? data.settings.currency} onDone={(amount) => { update((d) => applyGoalMovement(d, moveGoal.id, amount, amount < 0 ? 'withdraw' : 'manual', now)); setMoveGoal(null); }} />
        </Sheet>
      )}
    </>
  );
}

function BudgetForm({ value, onSave, onDelete }: { value: Partial<Budget>; onSave: (b: Budget) => void; onDelete?: () => void }) {
  const { data } = useStore();
  const [categoryId, setCategoryId] = useState(value.categoryId ?? data.categories.find((c) => c.kind === 'expense')!.id);
  const [limit, setLimit] = useState(value.limit ? String(value.limit / 100) : '');
  const [warnAt, setWarnAt] = useState(Math.round((value.warnAt ?? 0.8) * 100));
  const [rollover, setRollover] = useState(value.rollover ?? false);
  const cents = parseAmount(limit);
  return (
    <>
      <Field label="Categoría">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {data.categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </Field>
      <Field label={`Tope mensual (${data.settings.currency})`}><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      <Field label={`Avisarme al llegar al ${warnAt} %`}><input type="range" min={50} max={100} step={5} value={warnAt} onChange={(e) => setWarnAt(Number(e.target.value))} /></Field>
      <Switch checked={rollover} onChange={setRollover}>Lo que sobre pasa al mes siguiente</Switch>
      <button className="btn primary block mt" disabled={!cents || cents <= 0} onClick={() => onSave({ id: value.id ?? '', categoryId, limit: Math.abs(cents!), warnAt: warnAt / 100, rollover })}>Guardar</button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar</button>}
    </>
  );
}

const ICONS = ['🛟', '🏖️', '🧾', '🏠', '🚗', '🎓', '💍', '🎁', '📈', '💳', '✈️', '🐷'];

function GoalForm({ value, onSave, onDelete }: { value: Partial<Goal>; onSave: (g: Goal) => void; onDelete?: () => void }) {
  const { data } = useStore();
  const [name, setName] = useState(value.name ?? '');
  const [icon, setIcon] = useState(value.icon ?? '🐷');
  const [kind, setKind] = useState<GoalKind>(value.kind ?? 'savings');
  const [currency, setCurrency] = useState(value.currency ?? data.settings.currency);
  const [target, setTarget] = useState(value.target ? String(value.target / 100) : '');
  const [deadline, setDeadline] = useState(value.deadline ?? '');
  const [monthly, setMonthly] = useState(value.monthlyPlan ? String(value.monthlyPlan / 100) : '');
  const [ret, setRet] = useState(String(value.expectedReturn ?? (kind === 'investment' ? 6 : 0)));
  const [accountIds, setAccountIds] = useState<string[]>(value.accountIds ?? []);
  const [priority, setPriority] = useState(value.priority ?? 1);
  const cents = parseAmount(target);
  const monthlyC = parseAmount(monthly) ?? 0;
  const linkable = data.accounts.filter((a) => (kind === 'debt' ? a.kind === 'loan' || a.kind === 'card' : kind === 'investment' ? ['investment', 'crypto', 'savings'].includes(a.kind) : ['savings', 'checking', 'investment'].includes(a.kind)));

  // Vista previa medible: cuánto tendrás en la fecha con el plan.
  const months = deadline ? Math.max(1, (Number(deadline.slice(0, 4)) - Number(today().slice(0, 4))) * 12 + Number(deadline.slice(5, 7)) - Number(today().slice(5, 7))) : null;
  const projection = months && cents ? futureValue(value.saved ?? 0, Math.abs(monthlyC), kind === 'investment' ? Number(ret) || 0 : 0, months) : null;

  return (
    <>
      <div className="seg">
        {(Object.keys(GOAL_KIND_LABEL) as GoalKind[]).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{GOAL_KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="chips mb">{ICONS.map((i) => <button key={i} className={`chip ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)}>{i}</button>)}</div>
      <Field label="Nombre"><input value={name} placeholder={kind === 'investment' ? 'Cartera indexada 20.000 €' : kind === 'debt' ? 'Liquidar tarjeta' : 'Fondo de emergencia 6 meses'} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Objetivo"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label="Moneda"><select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
      </div>
      <div className="grid2">
        <Field label="Fecha límite"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Aportación mensual"><input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
      </div>
      {kind === 'investment' && <Field label={`Rentabilidad anual esperada: ${ret} %`}><input type="range" min={0} max={15} step={0.5} value={ret} onChange={(e) => setRet(e.target.value)} /></Field>}
      {linkable.length > 0 && (
        <Field label={kind === 'debt' ? 'Deuda que quieres liquidar' : 'Medir con el saldo de estas cuentas (opcional)'}>
          <div className="chips">
            {linkable.map((a) => (
              <button key={a.id} className={`chip ${accountIds.includes(a.id) ? 'on' : ''}`} onClick={() => setAccountIds(accountIds.includes(a.id) ? accountIds.filter((x) => x !== a.id) : [...accountIds, a.id])}>{a.name}</button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Prioridad para el ahorro automático"><input type="number" min={1} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 1)} /></Field>
      {projection !== null && cents && (
        <div className={`alert ${projection >= cents ? 'good' : 'warning'} small`}>
          Con {formatMoney(Math.abs(monthlyC), currency)}/mes llegarás a <b>{formatMoney(projection, currency)}</b> en {months} meses: {projection >= cents ? '¡meta cumplida!' : `te faltarían ${formatMoney(cents - projection, currency)}.`}
        </div>
      )}
      <button
        className="btn primary block mt"
        disabled={!name || !cents}
        onClick={() => {
          const debtStart = kind === 'debt' ? accountIds.reduce((s, id) => s + Math.abs(data.accounts.find((a) => a.id === id)?.balance ?? 0), 0) : undefined;
          onSave({
            id: value.id ?? '',
            name,
            icon,
            kind,
            currency,
            target: Math.abs(cents!),
            saved: value.saved ?? 0,
            deadline: deadline || undefined,
            monthlyPlan: Math.abs(monthlyC) || undefined,
            expectedReturn: kind === 'investment' ? Number(ret) : undefined,
            accountIds: accountIds.length ? accountIds : undefined,
            priority,
            startDate: value.startDate ?? today(),
            startAmount: value.startAmount ?? debtStart ?? value.saved ?? 0,
          });
        }}
      >
        Guardar meta
      </button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar meta</button>}
    </>
  );
}

function GoalMove({ currency, onDone }: { currency: string; onDone: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  const cents = parseAmount(amount);
  return (
    <>
      <div className="amount-wrap">
        <input className="amount-input" inputMode="decimal" autoFocus placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" style={{ width: `${Math.max(2, amount.length + 1)}ch` }} />
        <span className="cur">{currency}</span>
      </div>
      <div className="grid2">
        <button className="btn" disabled={!cents} onClick={() => onDone(-Math.abs(cents!))}>Retirar</button>
        <button className="btn primary" disabled={!cents} onClick={() => onDone(Math.abs(cents!))}>Aportar</button>
      </div>
    </>
  );
}
