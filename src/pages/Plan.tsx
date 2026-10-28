import { useState } from 'react';
import { budgetStatus, suggestBudgets } from '../lib/budgets';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import { applyGoalMovement, monthlyNeeded, safeToSave } from '../lib/savings';
import type { Budget, Goal } from '../lib/types';
import { useStore } from '../store';
import { Empty, Field, Meter, Money, Sheet, StateBadge } from '../components/ui';

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

  return (
    <>
      <div className="seg">
        <button className={tab === 'budgets' ? 'on' : ''} onClick={() => setTab('budgets')}>Presupuestos</button>
        <button className={tab === 'goals' ? 'on' : ''} onClick={() => setTab('goals')}>Huchas</button>
        <button className={tab === 'auto' ? 'on' : ''} onClick={() => setTab('auto')}>Automático</button>
      </div>

      {tab === 'budgets' && (
        <>
          {statuses.length === 0 && <Empty>Sin presupuestos todavía. Crea uno o acepta una sugerencia.</Empty>}
          {statuses.map((s) => (
            <div className="card" key={s.budget.id} onClick={() => setEditBudget(s.budget)} style={{ cursor: 'pointer' }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <b>{cat(s.budget.categoryId)?.icon} {cat(s.budget.categoryId)?.name}</b>
                <StateBadge state={s.state} />
              </div>
              <Meter ratio={s.ratio} state={s.state} label={`Gastado ${Math.round(s.ratio * 100)} %`} />
              <div className="row between small" style={{ marginTop: 6 }}>
                <span><Money cents={s.spent} /> de <Money cents={s.limit} /></span>
                <span className="muted">
                  {s.remaining >= 0 ? `Quedan ${formatMoney(s.remaining)} · ${formatMoney(s.dailyAllowance)}/día` : `${formatMoney(-s.remaining)} de más`}
                </span>
              </div>
              {s.projected > s.limit && s.state !== 'over' && (
                <div className="small" style={{ marginTop: 4, color: 'var(--warn)' }}>⚠ Al ritmo actual acabarás el mes en {formatMoney(s.projected)}.</div>
              )}
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="card">
              <h2>Sugerencias según tu gasto medio</h2>
              <ul className="list">
                {suggestions.slice(0, 5).map((s) => (
                  <li key={s.categoryId}>
                    <span className="grow">{cat(s.categoryId)?.icon} {cat(s.categoryId)?.name}</span>
                    <Money cents={s.limit} />
                    <button
                      className="btn small"
                      onClick={() => update((d) => ({ ...d, budgets: [...d.budgets, { id: uid(), categoryId: s.categoryId, limit: s.limit, warnAt: 0.8, rollover: false }] }))}
                    >
                      Añadir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn block" onClick={() => setEditBudget({ warnAt: 0.8, rollover: false })}>+ Nuevo presupuesto</button>
        </>
      )}

      {tab === 'goals' && (
        <>
          {data.goals.length === 0 && <Empty>Crea huchas para separar tu dinero: emergencias, vacaciones, impuestos…</Empty>}
          {[...data.goals].sort((a, b) => a.priority - b.priority).map((g) => {
            const need = monthlyNeeded(g, month);
            return (
              <div className="card" key={g.id}>
                <div className="row between" style={{ marginBottom: 8 }}>
                  <b onClick={() => setEditGoal(g)} style={{ cursor: 'pointer' }}>{g.icon} {g.name}</b>
                  <span className="small muted">Prioridad {g.priority}</span>
                </div>
                <Meter ratio={g.target ? g.saved / g.target : 0} state="goal" label={`${g.name}: ${Math.round((g.saved / (g.target || 1)) * 100)} %`} />
                <div className="row between small" style={{ marginTop: 6 }}>
                  <span><Money cents={g.saved} /> de <Money cents={g.target} /></span>
                  <span className="muted">{Math.round((g.saved / (g.target || 1)) * 100)} %</span>
                </div>
                {need !== null && need > 0 && <div className="small muted" style={{ marginTop: 4 }}>Aparta {formatMoney(need)}/mes para llegar a tiempo.</div>}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn grow" onClick={() => setMoveGoal(g)}>Aportar / retirar</button>
                </div>
              </div>
            );
          })}
          <button className="btn block" onClick={() => setEditGoal({ icon: '🐷', priority: data.goals.length + 1 })}>+ Nueva hucha</button>
        </>
      )}

      {tab === 'auto' && (
        <div className="card">
          <h2>Ahorro automático</h2>
          <p className="small muted" style={{ marginTop: 0 }}>
            Cada mes la app calcula cuánto puedes apartar y lo reparte entre tus huchas por prioridad. Tú confirmas el movimiento desde Inicio.
          </p>
          <label className="check"><input type="checkbox" checked={r.enabled} onChange={(e) => update((d) => ({ ...d, savingsRules: { ...r, enabled: e.target.checked } }))} />Activar ahorro automático</label>
          <label className="check"><input type="checkbox" checked={r.roundUp} disabled={!r.enabled} onChange={(e) => update((d) => ({ ...d, savingsRules: { ...r, roundUp: e.target.checked } }))} />Redondear compras al euro</label>
          <label className="check"><input type="checkbox" checked={r.smartSave} disabled={!r.enabled} onChange={(e) => update((d) => ({ ...d, savingsRules: { ...r, smartSave: e.target.checked } }))} />Ahorro inteligente según mis hábitos</label>
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
        <Sheet title={editGoal.id ? 'Editar hucha' : 'Nueva hucha'} onClose={() => setEditGoal(null)}>
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
          <GoalMove onDone={(amount) => { update((d) => applyGoalMovement(d, moveGoal.id, amount, amount < 0 ? 'withdraw' : 'manual', now)); setMoveGoal(null); }} />
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
      <Field label="Tope mensual (€)"><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      <Field label={`Avisarme al llegar al ${warnAt} %`}><input type="range" min={50} max={100} step={5} value={warnAt} onChange={(e) => setWarnAt(Number(e.target.value))} /></Field>
      <label className="check"><input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />Lo que sobre pasa al mes siguiente</label>
      <button className="btn primary block" disabled={!cents || cents <= 0} onClick={() => onSave({ id: value.id ?? '', categoryId, limit: Math.abs(cents!), warnAt: warnAt / 100, rollover })}>Guardar</button>
      {onDelete && <button className="btn danger block" style={{ marginTop: 8 }} onClick={onDelete}>Eliminar</button>}
    </>
  );
}

function GoalForm({ value, onSave, onDelete }: { value: Partial<Goal>; onSave: (g: Goal) => void; onDelete?: () => void }) {
  const [name, setName] = useState(value.name ?? '');
  const [icon, setIcon] = useState(value.icon ?? '🐷');
  const [target, setTarget] = useState(value.target ? String(value.target / 100) : '');
  const [deadline, setDeadline] = useState(value.deadline ?? '');
  const [priority, setPriority] = useState(value.priority ?? 1);
  const cents = parseAmount(target);
  return (
    <>
      <div className="chips" style={{ marginBottom: 12 }}>
        {['🛟', '🏖️', '🧾', '🏠', '🚗', '🎓', '💍', '🎁', '🐷'].map((i) => (
          <button key={i} className={`chip ${icon === i ? 'on' : ''}`} onClick={() => setIcon(i)}>{i}</button>
        ))}
      </div>
      <Field label="Nombre"><input value={name} placeholder="Fondo de emergencia" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Objetivo (€)"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Fecha límite (opcional)"><input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Prioridad"><input type="number" min={1} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 1)} /></Field>
      </div>
      <button className="btn primary block" disabled={!name || !cents} onClick={() => onSave({ id: value.id ?? '', name, icon, target: Math.abs(cents!), saved: value.saved ?? 0, deadline: deadline || undefined, priority })}>Guardar</button>
      {onDelete && <button className="btn danger block" style={{ marginTop: 8 }} onClick={onDelete}>Eliminar hucha</button>}
    </>
  );
}

function GoalMove({ onDone }: { onDone: (amount: number) => void }) {
  const [amount, setAmount] = useState('');
  const cents = parseAmount(amount);
  return (
    <>
      <input className="amount-input" inputMode="decimal" autoFocus placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" />
      <div className="grid2">
        <button className="btn" disabled={!cents} onClick={() => onDone(-Math.abs(cents!))}>Retirar</button>
        <button className="btn primary" disabled={!cents} onClick={() => onDone(Math.abs(cents!))}>Aportar</button>
      </div>
    </>
  );
}
