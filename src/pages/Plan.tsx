import { categoryLabel } from '../lib/categories';
import { useState } from 'react';
import { CatBadge, GOAL_ICONS, GoalIcon, Icon } from '../components/icons';
import { GuideTip } from '../components/GuideCard';
import { RecurringTab } from '../components/RecurringTab';
import { Empty, Field, Meter, Money, Segmented, Sheet, StateBadge, Switch, toast } from '../components/ui';
import { guideTasks, patchGuide } from '../lib/guide';
import { budgetStatus, suggestBudgets } from '../lib/budgets';
import { CURRENCIES } from '../lib/fx';
import { futureValue, goalProgress, GOAL_KIND_LABEL, GOAL_STATUS_LABEL } from '../lib/goals';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import { applyGoalMovement, safeToSave } from '../lib/savings';
import type { Budget, Goal, GoalKind } from '../lib/types';
import { decisionAdvice } from '../lib/mentor';
import { useStore } from '../store';
import { t as _t } from '../lib/i18n';

export function Plan() {
  const { data, update } = useStore();
  const now = today();
  const month = now.slice(0, 7);
  const [tab, setTab] = useState<'budgets' | 'goals' | 'recurring' | 'auto'>('budgets');
  const [editBudget, setEditBudget] = useState<Partial<Budget> | null>(null);
  const [editGoal, setEditGoal] = useState<Partial<Goal> | null>(null);
  const [moveGoal, setMoveGoal] = useState<Goal | null>(null);
  const guide = guideTasks(data);
  const askBudget = !!guide && !guide.budget;
  const [budgetTest, setBudgetTest] = useState(true);

  const statuses = budgetStatus(data, month, Number(now.slice(8)));
  const suggestions = suggestBudgets(data, month);
  const cat = (id: string) => data.categories.find((c) => c.id === id);
  const r = data.savingsRules;
  const totalBudget = statuses.reduce((s, b) => s + b.limit, 0);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0);

  return (
    <>
      {tab === 'budgets' && <GuideTip task="budget" />}
      <Segmented value={tab} onChange={setTab} options={[['budgets', 'Presupuestos'], ['goals', 'Metas'], ['recurring', 'Fijos'], ['auto', 'Ahorro']]} />
      {tab === 'recurring' && <RecurringTab />}

      {tab === 'budgets' && (
        <>
          {statuses.length > 0 && (
            <div className="hero glass">
              <div className="small secondary">{_t("Gastado este mes en categorías con tope")}</div>
              <div className="big">{formatMoney(totalSpent)} <span className="small muted">{_t("de")} {formatMoney(totalBudget)}</span></div>
              <div className="mt"><Meter ratio={totalBudget ? totalSpent / totalBudget : 0} state={totalSpent > totalBudget ? 'over' : totalSpent > totalBudget * 0.8 ? 'warning' : 'ok'} label={_t("Presupuesto total")} /></div>
            </div>
          )}
          {statuses.length === 0 && <Empty>{_t("Sin presupuestos todavía. Crea uno, acepta una sugerencia o pídeselos al asesor.")}</Empty>}
          {statuses.map((s) => (
            <div className="card glass" key={s.budget.id} onClick={() => setEditBudget(s.budget)} style={{ cursor: 'pointer' }}>
              <div className="row between mb">
                <b className="row"><CatBadge id={s.budget.categoryId} emoji={cat(s.budget.categoryId)?.icon} />{_t(cat(s.budget.categoryId)?.name ?? '')}</b>
                <StateBadge state={s.state} />
              </div>
              <Meter ratio={s.ratio} state={s.state} label={`Gastado ${Math.round(s.ratio * 100)} %`} />
              <div className="row between small" style={{ marginTop: 8 }}>
                <span><Money cents={s.spent} /> <span className="muted">{_t("de")}</span> <Money cents={s.limit} /></span>
                <span className="muted">{s.remaining >= 0 ? _t('{amount}/día', { amount: formatMoney(s.dailyAllowance) }) : _t('{amount} de más', { amount: formatMoney(-s.remaining) })}</span>
              </div>
              {s.projected > s.limit && s.state !== 'over' && <div className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>{_t("Al ritmo actual acabarás el mes en")} {formatMoney(s.projected)}.</div>}
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="card glass">
              <h2>{_t("Sugerencias según tu gasto medio")}</h2>
              <ul className="list">
                {suggestions.slice(0, 5).map((s) => (
                  <li key={s.categoryId}>
                    <CatBadge id={s.categoryId} emoji={cat(s.categoryId)?.icon} /><span className="grow">{_t(cat(s.categoryId)?.name ?? '')}</span>
                    <Money cents={s.limit} />
                    <button className="btn sm tinted" onClick={() => (askBudget ? setEditBudget({ categoryId: s.categoryId, limit: s.limit, warnAt: 0.8, rollover: false }) : update((d) => ({ ...d, budgets: [...d.budgets, { id: uid(), categoryId: s.categoryId, limit: s.limit, warnAt: 0.8, rollover: false }] })))}>{_t("Añadir")}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn block glass" onClick={() => setEditBudget({ warnAt: 0.8, rollover: false })}><Icon name="plus" size={18} /> {_t("Nuevo presupuesto")}</button>
        </>
      )}

      {tab === 'goals' && (
        <>
          {data.goals.length === 0 && <Empty>{_t("Crea metas medibles: una cifra, una fecha y un plan mensual. Ahorro, inversión, compras o pagar deudas.")}</Empty>}
          {[...data.goals].sort((a, b) => a.priority - b.priority).map((g) => {
            const p = goalProgress(data, g, now);
            return (
              <div className="card glass" key={g.id}>
                <div className="row" onClick={() => setEditGoal(g)} style={{ cursor: 'pointer' }}>
                  <span className="icon"><GoalIcon icon={g.icon} /></span>
                  <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: '-0.02em' }} className="ellipsis">{g.name}</div>
                    <div className="tiny muted">{GOAL_KIND_LABEL[g.kind ?? 'savings']}{g.accountIds?.length ? _t(" · medida con tus cuentas") : ''}</div>
                  </div>
                  <span className={`badge ${p.status}`}>{GOAL_STATUS_LABEL[p.status]}</span>
                </div>
                <div className="row between mt" style={{ alignItems: 'baseline' }}>
                  <span className="mid">{formatMoney(p.current, p.currency)}</span>
                  <span className="small muted">{_t("de")} {formatMoney(g.target, p.currency)} · {Math.round(p.ratio * 100)} %</span>
                </div>
                <div className="mt"><Meter ratio={p.ratio} state="goal" mark={p.expectedRatio} label={`${g.name}: ${Math.round(p.ratio * 100)} %`} /></div>
                <div className="kv small mt">
                  {g.deadline && <><span className="muted">{_t("Fecha límite")}</span><span>{g.deadline} · {p.monthsLeft} {_t("meses")}</span></>}
                  {p.requiredMonthly !== null && p.requiredMonthly > 0 && <><span className="muted">{_t("Necesitas al mes")}</span><b>{formatMoney(p.requiredMonthly, p.currency)}</b></>}
                  {g.monthlyPlan ? <><span className="muted">{_t("Plan mensual")}</span><span>{formatMoney(g.monthlyPlan, p.currency)}</span></> : null}
                  <span className="muted">{_t("Aportas de media")}</span><span>{formatMoney(p.actualMonthly, p.currency)}{_t("/mes")}</span>
                  {p.projectedDate && p.status !== 'done' && <><span className="muted">{_t("Al ritmo actual")}</span><span>{_t("la logras en")} {p.projectedDate.slice(0, 7)}</span></>}
                  {g.kind === 'investment' && p.projectedAtDeadline !== null && <><span className="muted">{_t("Proyección a la fecha (")}{g.expectedReturn ?? 0} {_t("%/año)")}</span><span>{formatMoney(p.projectedAtDeadline, p.currency)}</span></>}
                </div>
                {!g.accountIds?.length && (
                  <button className="btn tinted block mt" onClick={() => setMoveGoal(g)}>{_t("Aportar / retirar")}</button>
                )}
              </div>
            );
          })}
          <button className="btn block glass" onClick={() => setEditGoal({ icon: 'piggy', kind: 'savings', priority: data.goals.length + 1 })}><Icon name="plus" size={18} /> {_t("Nueva meta")}</button>
        </>
      )}

      {tab === 'auto' && (
        <div className="card glass">
          <h2>{_t("Ahorro automático")}</h2>
          <p className="small muted" style={{ marginTop: 0 }}>{_t("Cada mes la app calcula cuánto puedes apartar y lo reparte entre tus huchas por prioridad. Tú lo confirmas desde Inicio.")}</p>
          <Switch checked={r.enabled} onChange={(v) => update((d) => ({ ...d, savingsRules: { ...r, enabled: v } }))}>{_t("Activar ahorro automático")}</Switch>
          <Switch checked={r.roundUp} disabled={!r.enabled} onChange={(v) => update((d) => ({ ...d, savingsRules: { ...r, roundUp: v } }))}>{_t("Redondear compras al euro")}</Switch>
          <Switch checked={r.smartSave} disabled={!r.enabled} onChange={(v) => update((d) => ({ ...d, savingsRules: { ...r, smartSave: v } }))}>{_t("Ahorro inteligente según mis hábitos")}</Switch>
          <Field label={`Porcentaje de cada ingreso: ${r.percentOfIncome} %`}>
            <input type="range" min={0} max={30} value={r.percentOfIncome} disabled={!r.enabled} onChange={(e) => update((d) => ({ ...d, savingsRules: { ...r, percentOfIncome: Number(e.target.value) } }))} />
          </Field>
          <div className="alert good small">
            <Icon name="info" size={18} />
            <div>{_t("Según tus últimos 3 meses, puedes apartar con seguridad unos")} <b>{formatMoney(safeToSave(data, month))}</b> {_t("este mes, dejando un colchón del 10 % de tus ingresos.")}</div>
          </div>
        </div>
      )}

      {editBudget && (
        <Sheet title={editBudget.id ? _t("Editar presupuesto") : _t("Nuevo presupuesto")} onClose={() => setEditBudget(null)}>
          <BudgetForm
            value={editBudget}
            onSave={(b) => {
              const newId = uid();
              const isNew = !(b.id && data.budgets.some((x) => x.id === b.id));
              update((d) => {
                let next: typeof d = { ...d, budgets: !isNew ? d.budgets.map((x) => (x.id === b.id ? b : x)) : [...d.budgets, { ...b, id: newId }] };
                if (isNew && askBudget) next = patchGuide(next, { budget: true, testBudgets: budgetTest ? [...(guide?.testBudgets ?? []), newId] : guide?.testBudgets ?? [] });
                return next;
              });
              if (isNew && askBudget) toast(budgetTest ? _t("Presupuesto de prueba creado: lo eliminaré al terminar la guía.") : _t("Presupuesto creado."));
              setEditBudget(null);
            }}
            guideChoice={askBudget && !editBudget.id ? { test: budgetTest, set: setBudgetTest } : undefined}
            onDelete={editBudget.id ? () => { update((d) => ({ ...d, budgets: d.budgets.filter((x) => x.id !== editBudget.id) })); setEditBudget(null); } : undefined}
          />
        </Sheet>
      )}
      {editGoal && (
        <Sheet title={editGoal.id ? _t("Editar meta") : _t("Nueva meta")} onClose={() => setEditGoal(null)}>
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
        <Sheet title={moveGoal.name} onClose={() => setMoveGoal(null)}>
          <GoalMove currency={moveGoal.currency ?? data.settings.currency} onDone={(amount) => { update((d) => applyGoalMovement(d, moveGoal.id, amount, amount < 0 ? 'withdraw' : 'manual', now)); setMoveGoal(null); }} />
        </Sheet>
      )}
    </>
  );
}

function BudgetForm({ value, onSave, onDelete, guideChoice }: { value: Partial<Budget>; onSave: (b: Budget) => void; onDelete?: () => void; guideChoice?: { test: boolean; set: (v: boolean) => void } }) {
  const { data } = useStore();
  const [categoryId, setCategoryId] = useState(value.categoryId ?? data.categories.find((c) => c.kind === 'expense')!.id);
  const [limit, setLimit] = useState(value.limit ? String(value.limit / 100) : '');
  const [warnAt, setWarnAt] = useState(Math.round((value.warnAt ?? 0.8) * 100));
  const [rollover, setRollover] = useState(value.rollover ?? false);
  const cents = parseAmount(limit);
  return (
    <>
      <Field label={_t("Categoría")}>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {data.categories.filter((c) => c.kind === 'expense').map((c) => ({ c, label: categoryLabel(data.categories, c.id) })).sort((a, b) => a.label.localeCompare(b.label, 'es')).map(({ c, label }) => <option key={c.id} value={c.id}>{label}</option>)}
        </select>
      </Field>
      <Field label={`Tope mensual (${data.settings.currency})`}><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      <Field label={`Avisarme al llegar al ${warnAt} %`}><input type="range" min={50} max={100} step={5} value={warnAt} onChange={(e) => setWarnAt(Number(e.target.value))} /></Field>
      <Switch checked={rollover} onChange={setRollover}>{_t("Lo que sobre pasa al mes siguiente")}</Switch>
      {guideChoice && (
        <div className="seg mt" role="group" aria-label={_t("Tipo de presupuesto")}>
          <button className={guideChoice.test ? 'on' : ''} onClick={() => guideChoice.set(true)}>{_t("Presupuesto de prueba")}</button>
          <button className={!guideChoice.test ? 'on' : ''} onClick={() => guideChoice.set(false)}>{_t("Presupuesto real")}</button>
        </div>
      )}
      <button className="btn primary block mt" disabled={!cents || cents <= 0} onClick={() => onSave({ id: value.id ?? '', categoryId, limit: Math.abs(cents!), warnAt: warnAt / 100, rollover })}>{_t("Guardar")}</button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>{_t("Eliminar")}</button>}
    </>
  );
}

const ICONS = GOAL_ICONS;

function GoalForm({ value, onSave, onDelete }: { value: Partial<Goal>; onSave: (g: Goal) => void; onDelete?: () => void }) {
  const { data } = useStore();
  const [name, setName] = useState(value.name ?? '');
  const [icon, setIcon] = useState(value.icon ?? 'piggy');
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
      {!value.id && <div className="callout"><b>{_t("Consejo")}</b> {decisionAdvice(data, 'goal')}</div>}
      <div className="seg">
        {(Object.keys(GOAL_KIND_LABEL) as GoalKind[]).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{GOAL_KIND_LABEL[k]}</button>
        ))}
      </div>
      <div className="chips mb">{ICONS.map((i) => <button key={i} aria-label={i} className={`chip ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)} style={{ padding: 10 }}><GoalIcon icon={i} size={18} /></button>)}</div>
      <Field label={_t("Nombre")}><input value={name} placeholder={kind === 'investment' ? _t("Cartera indexada 20.000 €") : kind === 'debt' ? _t("Liquidar tarjeta") : _t("Fondo de emergencia 6 meses")} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid2">
        <Field label={_t("Objetivo")}><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        <Field label={_t("Moneda")}><select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
      </div>
      <div className="grid2">
        <Field label={_t("Fecha límite")}><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label={_t("Aportación mensual")}><input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
      </div>
      {kind === 'investment' && <Field label={`Rentabilidad anual esperada: ${ret} %`}><input type="range" min={0} max={15} step={0.5} value={ret} onChange={(e) => setRet(e.target.value)} /></Field>}
      {linkable.length > 0 && (
        <Field label={kind === 'debt' ? _t("Deuda que quieres liquidar") : _t("Medir con el saldo de estas cuentas (opcional)")}>
          <div className="chips">
            {linkable.map((a) => (
              <button key={a.id} className={`chip ${accountIds.includes(a.id) ? 'on' : ''}`} onClick={() => setAccountIds(accountIds.includes(a.id) ? accountIds.filter((x) => x !== a.id) : [...accountIds, a.id])}>{a.name}</button>
            ))}
          </div>
        </Field>
      )}
      <Field label={_t("Prioridad para el ahorro automático")}><input type="number" min={1} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 1)} /></Field>
      {projection !== null && cents && (
        <div className={`alert ${projection >= cents ? 'good' : 'warning'} small`}>
          {_t("Con")} {formatMoney(Math.abs(monthlyC), currency)}{_t("/mes llegarás a")} <b>{formatMoney(projection, currency)}</b> {_t("en")} {months} {_t("meses:")} {projection >= cents ? _t("¡meta cumplida!") : `te faltarían ${formatMoney(cents - projection, currency)}.`}
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
        {_t("Guardar meta")}
      </button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>{_t("Eliminar meta")}</button>}
    </>
  );
}

function GoalMove({ currency, onDone }: { currency: string; onDone: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  const cents = parseAmount(amount);
  return (
    <>
      <div className="amount-wrap">
        <input className="amount-input" inputMode="decimal" autoFocus placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={_t("Importe")} style={{ width: `${Math.max(2, amount.length + 1)}ch` }} />
        <span className="cur">{currency}</span>
      </div>
      <div className="grid2">
        <button className="btn" disabled={!cents} onClick={() => onDone(-Math.abs(cents!))}>{_t("Retirar")}</button>
        <button className="btn primary" disabled={!cents} onClick={() => onDone(Math.abs(cents!))}>{_t("Aportar")}</button>
      </div>
    </>
  );
}
