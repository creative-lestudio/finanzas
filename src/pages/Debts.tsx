import { useState } from 'react';
import { saveTransaction } from '../components/QuickAdd';
import { Icon } from '../components/icons';
import { Empty, Field, Meter, Segmented, Sheet, toast } from '../components/ui';
import { DEBT_CATEGORIES, debtTotals, FREQ_DEBT_LABEL, installmentFor, isSettled, newPayment, PRIORITY_LABEL, scheduleOf, sortDebts, statusOf } from '../lib/debts';
import { CURRENCIES } from '../lib/fx';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import type { AppData, Debt, DebtPlan } from '../lib/types';
import { useStore } from '../store';

const dateFmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const toInput = (cents: number) => String(cents / 100).replace('.', ',');

/** Deudas: lo que me deben y lo que debo, con categoría, prioridad, pagos y plan de pago. */
export function Debts() {
  const { data, update } = useStore();
  const base = data.settings.currency;
  const [dir, setDir] = useState<'owe' | 'owed'>('owe');
  const [cat, setCat] = useState<'' | Debt['category']>('');
  const [prio, setPrio] = useState<'' | Debt['priority']>('');
  const [showSettled, setShowSettled] = useState(false);
  const [edit, setEdit] = useState<Partial<Debt> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const totals = debtTotals(data);
  const all = data.debts ?? [];
  const mine = all.filter((d) => d.direction === dir);
  const usedCats = [...new Set(mine.map((d) => d.category))];
  const list = sortDebts(mine.filter((d) => (!cat || d.category === cat) && (!prio || d.priority === prio) && (showSettled || !isSettled(d))));
  const settledCount = mine.filter(isSettled).length;
  const open = all.find((d) => d.id === openId) ?? null;

  return (
    <>
      <div className="hero glass">
        <div className="grid2">
          <div><div className="tiny muted">Debo</div><div className="mid neg">{formatMoney(totals.owe, base)}</div></div>
          <div><div className="tiny muted">Me deben</div><div className="mid pos">{formatMoney(totals.owed, base)}</div></div>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          Balance <b className={totals.net >= 0 ? 'pos' : 'neg'}>{formatMoney(totals.net, base)}</b>
          {totals.overdue > 0 && <> · <b className="neg">{totals.overdue} vencida{totals.overdue > 1 ? 's' : ''}</b></>}
        </div>
      </div>

      <Segmented value={dir} onChange={(v) => { setDir(v); setCat(''); setPrio(''); }} options={[['owe', 'Lo que debo'], ['owed', 'Me deben']]} />

      {mine.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Todas</button>
          {usedCats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(cat === c ? '' : c)}>{DEBT_CATEGORIES[c].label}</button>)}
        </div>
      )}
      {mine.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {(['high', 'medium', 'low'] as const).map((p) => <button key={p} className={`chip ${prio === p ? 'on' : ''}`} onClick={() => setPrio(prio === p ? '' : p)}>Prioridad {PRIORITY_LABEL[p].toLowerCase()}</button>)}
        </div>
      )}

      {list.length === 0 ? (
        <Empty>{mine.length === 0 ? (dir === 'owe' ? 'No tienes deudas anotadas. Si pides o debes dinero, anótalo aquí y planifica cómo pagarlo.' : 'Nadie te debe dinero (en lo anotado). Si prestas, anótalo para no olvidarlo.') : 'Ninguna deuda coincide con el filtro.'}</Empty>
      ) : (
        list.map((d) => <DebtCard key={d.id} debt={d} onOpen={() => setOpenId(d.id)} />)
      )}
      {settledCount > 0 && <button className="btn ghost block small" onClick={() => setShowSettled(!showSettled)}>{showSettled ? 'Ocultar saldadas' : `Ver saldadas (${settledCount})`}</button>}
      <button className="btn block glass" onClick={() => setEdit({ direction: dir, priority: 'medium', category: 'personal', currency: base })}><Icon name="plus" size={18} /> Nueva deuda</button>

      {edit && (
        <Sheet title={edit.id ? 'Editar deuda' : 'Nueva deuda'} onClose={() => setEdit(null)}>
          <DebtForm
            value={edit}
            onSave={(d, accountId) => {
              update((cur) => {
                const exists = (cur.debts ?? []).some((x) => x.id === d.id);
                let next: AppData = { ...cur, debts: exists ? cur.debts.map((x) => (x.id === d.id ? { ...x, ...d, payments: x.payments, plan: x.plan } : x)) : [...(cur.debts ?? []), d] };
                // Al crearla se puede anotar el dinero que salió (préstamo que hice) o entró (préstamo que recibí).
                if (!exists && accountId) {
                  next = saveTransaction(next, { accountId, date: today(), amount: d.direction === 'owed' ? -d.amount : d.amount, description: d.direction === 'owed' ? `Préstamo a ${d.person}` : `Préstamo de ${d.person}`, categoryId: d.direction === 'owed' ? 'other' : 'other_income', categorySource: 'user' }).next;
                }
                return next;
              });
              toast('Deuda guardada');
              setEdit(null);
              setDir(d.direction);
            }}
          />
        </Sheet>
      )}
      {open && (
        <Sheet title={open.person} onClose={() => setOpenId(null)}>
          <DebtDetail debt={open} onEdit={() => { setEdit(open); setOpenId(null); }} onClose={() => setOpenId(null)} />
        </Sheet>
      )}
    </>
  );
}

function DebtCard({ debt, onOpen }: { debt: Debt; onOpen: () => void }) {
  const st = statusOf(debt);
  const tag = st.settled ? 'Saldada' : st.overdue ? 'Vencida' : debt.priority === 'high' ? 'Prioridad alta' : debt.priority === 'low' ? 'Baja' : '';
  return (
    <div className="card glass" onClick={onOpen} style={{ cursor: 'pointer', opacity: st.settled ? 0.6 : 1 }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span className="icon"><Icon name={DEBT_CATEGORIES[debt.category].icon} size={20} /></span>
        <div className="grow">
          <div className="ellipsis"><b>{debt.person}</b></div>
          <div className="small muted ellipsis">{debt.title} · {DEBT_CATEGORIES[debt.category].label}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={`mid num ${debt.direction === 'owe' ? 'neg' : 'pos'}`} style={{ fontSize: 18 }}>{formatMoney(st.remaining, debt.currency)}</div>
          <div className="tiny muted">de {formatMoney(debt.amount, debt.currency)}</div>
        </div>
      </div>
      <div style={{ margin: '10px 0 6px' }}><Meter ratio={st.ratio} state={st.settled ? 'goal' : st.overdue ? 'over' : 'ok'} label="Pagado" /></div>
      <div className="row small between" style={{ gap: 8 }}>
        <span className="muted">
          {st.settled ? 'Sin pendiente' : st.next ? `Cuota ${formatMoney(st.next.amount, debt.currency)} · ${dateFmt(st.next.date)}` : debt.dueDate ? `Vence ${dateFmt(debt.dueDate)}` : 'Sin fecha'}
        </span>
        {tag && <span className="pill" style={{ color: st.overdue ? 'var(--bad)' : debt.priority === 'high' ? 'var(--warn)' : undefined }}>{tag}</span>}
      </div>
    </div>
  );
}

function DebtForm({ value, onSave }: { value: Partial<Debt>; onSave: (d: Debt, accountId?: string) => void }) {
  const { data } = useStore();
  const [direction, setDirection] = useState<Debt['direction']>(value.direction ?? 'owe');
  const [person, setPerson] = useState(value.person ?? '');
  const [title, setTitle] = useState(value.title ?? '');
  const [amount, setAmount] = useState(value.amount ? toInput(value.amount) : '');
  const [currency, setCurrency] = useState(value.currency ?? data.settings.currency);
  const [category, setCategory] = useState<Debt['category']>(value.category ?? 'personal');
  const [priority, setPriority] = useState<Debt['priority']>(value.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(value.dueDate ?? '');
  const [note, setNote] = useState(value.note ?? '');
  const [accountId, setAccountId] = useState('');
  const cents = Math.abs(parseAmount(amount) ?? 0);
  const accounts = data.accounts.filter((a) => a.currency === currency && a.kind !== 'investment' && a.kind !== 'crypto' && a.kind !== 'loan');

  return (
    <>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={direction === 'owe' ? 'on' : ''} onClick={() => setDirection('owe')}>Yo debo</button>
        <button className={direction === 'owed' ? 'on' : ''} onClick={() => setDirection('owed')}>Me deben</button>
      </div>
      <Field label={direction === 'owe' ? 'A quién le debo' : 'Quién me debe'}><input value={person} placeholder="Nombre de la persona o entidad" onChange={(e) => setPerson(e.target.value)} aria-label="Persona" /></Field>
      <Field label="Concepto"><input value={title} placeholder="Préstamo, alquiler atrasado, trabajo…" onChange={(e) => setTitle(e.target.value)} aria-label="Concepto" /></Field>
      <div className="grid2">
        <Field label="Importe total"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" /></Field>
        <Field label="Moneda"><select value={currency} onChange={(e) => { setCurrency(e.target.value); setAccountId(''); }}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}</select></Field>
      </div>
      <Field label="Categoría">
        <select value={category} onChange={(e) => setCategory(e.target.value as Debt['category'])} aria-label="Categoría">
          {(Object.keys(DEBT_CATEGORIES) as Debt['category'][]).map((c) => <option key={c} value={c}>{DEBT_CATEGORIES[c].label}</option>)}
        </select>
      </Field>
      <div className="small muted" style={{ margin: '0 4px 4px' }}>Prioridad</div>
      <div className="seg" style={{ marginBottom: 12 }}>
        {(['high', 'medium', 'low'] as const).map((p) => <button key={p} className={priority === p ? 'on' : ''} onClick={() => setPriority(p)}>{PRIORITY_LABEL[p]}</button>)}
      </div>
      <Field label="Fecha límite (opcional)"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Fecha límite" /></Field>
      <Field label="Nota (opcional)"><input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota" /></Field>
      {!value.id && accounts.length > 0 && (
        <Field label={direction === 'owed' ? 'Descontar de una cuenta (si ya les diste el dinero)' : 'Sumar a una cuenta (si ya recibiste el dinero)'}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta">
            <option value="">No anotar en ninguna cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </select>
        </Field>
      )}
      <button className="btn primary block mt" disabled={!person.trim() || !cents} onClick={() => onSave({ id: value.id ?? uid(), direction, person: person.trim(), title: title.trim() || (direction === 'owe' ? 'Deuda' : 'Préstamo'), category, priority, amount: cents, currency, dueDate: dueDate || undefined, note: note.trim() || undefined, createdAt: value.createdAt ?? today(), payments: value.payments ?? [], plan: value.plan }, accountId || undefined)}>Guardar</button>
    </>
  );
}

function DebtDetail({ debt, onEdit, onClose }: { debt: Debt; onEdit: () => void; onClose: () => void }) {
  const { data, update } = useStore();
  const st = statusOf(debt);
  const cur = debt.currency;
  const sched = scheduleOf(debt);
  const defaultPay = st.next?.amount ?? st.remaining;
  const [amount, setAmount] = useState(defaultPay ? toInput(Math.min(defaultPay, st.remaining || defaultPay)) : '');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const accounts = data.accounts.filter((a) => a.currency === cur && a.kind !== 'investment' && a.kind !== 'crypto' && a.kind !== 'loan');
  const [planOpen, setPlanOpen] = useState(false);
  const [months, setMonths] = useState('');
  const [planAmount, setPlanAmount] = useState(debt.plan ? toInput(debt.plan.amount) : '');
  const [freq, setFreq] = useState<DebtPlan['freq']>(debt.plan?.freq ?? 'monthly');
  const [start, setStart] = useState(debt.plan?.start ?? today());
  const [allSched, setAllSched] = useState(false);

  const patch = (fn: (d: Debt) => Debt) => update((cur) => ({ ...cur, debts: cur.debts.map((x) => (x.id === debt.id ? fn(x) : x)) }));
  const pay = () => {
    const cents = Math.abs(parseAmount(amount) ?? 0);
    if (!cents) return;
    const p = newPayment(Math.min(cents, st.remaining || cents), date, note);
    update((cur) => {
      let next: AppData = cur;
      if (accountId) {
        const r = saveTransaction(next, { accountId, date, amount: debt.direction === 'owe' ? -p.amount : p.amount, description: debt.direction === 'owe' ? `Pago de deuda: ${debt.person}` : `Cobro de deuda: ${debt.person}`, categoryId: debt.direction === 'owe' ? 'other' : 'other_income', categorySource: 'user' });
        next = r.next;
        p.txId = next.transactions[next.transactions.length - 1].id;
      }
      return { ...next, debts: next.debts.map((x) => (x.id === debt.id ? { ...x, payments: [...x.payments, p] } : x)) };
    });
    toast(debt.direction === 'owe' ? 'Pago anotado' : 'Cobro anotado');
    setNote('');
    setAmount('');
  };
  const removePayment = (id: string) => {
    const p = debt.payments.find((x) => x.id === id);
    if (!p || !confirm('¿Quitar este pago? Si lo anotaste en una cuenta, también se deshace ahí.')) return;
    update((cur) => {
      const tx = p.txId ? cur.transactions.find((t) => t.id === p.txId) : undefined;
      const next: AppData = tx ? { ...cur, transactions: cur.transactions.filter((t) => t.id !== tx.id), accounts: cur.accounts.map((a) => (a.id === tx.accountId ? { ...a, balance: a.balance - tx.amount } : a)) } : cur;
      return { ...next, debts: next.debts.map((x) => (x.id === debt.id ? { ...x, payments: x.payments.filter((q) => q.id !== id) } : x)) };
    });
  };
  const savePlan = () => {
    const a = Math.abs(parseAmount(planAmount) ?? 0);
    if (!a) return;
    patch((d) => ({ ...d, plan: { amount: a, freq, start } }));
    toast('Plan de pago guardado');
    setPlanOpen(false);
  };

  return (
    <>
      <div className="center mb">
        <div className="small muted">{debt.title} · {DEBT_CATEGORIES[debt.category].label} · prioridad {PRIORITY_LABEL[debt.priority].toLowerCase()}</div>
        <div className={`big num ${debt.direction === 'owe' ? 'neg' : 'pos'}`}>{formatMoney(st.remaining, cur)}</div>
        <div className="small muted">{debt.direction === 'owe' ? 'pendiente de pagar' : 'pendiente de cobrar'} · de {formatMoney(debt.amount, cur)}</div>
        <div style={{ margin: '10px 0 0' }}><Meter ratio={st.ratio} state={st.settled ? 'goal' : st.overdue ? 'over' : 'ok'} label="Pagado" /></div>
        {debt.dueDate && <div className="small muted" style={{ marginTop: 6 }}>Fecha límite: <span className={st.overdue ? 'neg' : ''}>{dateFmt(debt.dueDate)}</span></div>}
        {debt.note && <div className="tiny muted mt">{debt.note}</div>}
      </div>

      {!st.settled && (
        <div className="card glass" style={{ margin: '0 0 12px' }}>
          <h2>{debt.direction === 'owe' ? 'Registrar un pago' : 'Registrar un cobro'}</h2>
          <div className="grid2">
            <Field label={`Importe (${cur})`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe del pago" /></Field>
            <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha del pago" /></Field>
          </div>
          {accounts.length > 0 && (
            <Field label={debt.direction === 'owe' ? 'Pagado desde' : 'Recibido en'}>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta del pago">
                <option value="">Solo anotar en la deuda</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </select>
            </Field>
          )}
          <Field label="Nota (opcional)"><input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota del pago" /></Field>
          <div className="grid2">
            <button className="btn primary" disabled={!parseAmount(amount)} onClick={pay}>Guardar pago</button>
            <button className="btn tinted" onClick={() => setAmount(toInput(st.remaining))}>Todo ({formatMoney(st.remaining, cur)})</button>
          </div>
        </div>
      )}

      <div className="card glass" style={{ margin: '0 0 12px' }}>
        <div className="card-head"><h2>Plan de pago</h2><button className="btn ghost sm" onClick={() => setPlanOpen(!planOpen)}>{debt.plan ? 'Cambiar' : 'Crear plan'}</button></div>
        {debt.plan ? (
          <p className="small" style={{ margin: '0 0 6px' }}>{formatMoney(debt.plan.amount, cur)} · {FREQ_DEBT_LABEL[debt.plan.freq].toLowerCase()}, desde {dateFmt(debt.plan.start)}{st.endsOn ? <> · termina hacia <b>{dateFmt(st.endsOn)}</b></> : null}</p>
        ) : (
          <p className="small muted" style={{ margin: '0 0 6px' }}>Define una cuota y la app calcula las fechas y avisa si te atrasas.</p>
        )}
        {planOpen && (
          <>
            <div className="grid2">
              <Field label="Saldar en (meses)"><input inputMode="numeric" value={months} placeholder="12" onChange={(e) => { setMonths(e.target.value); const n = Number(e.target.value); if (n > 0) setPlanAmount(toInput(installmentFor(st.remaining || debt.amount, n))); }} aria-label="Meses" /></Field>
              <Field label={`Cuota (${cur})`}><input inputMode="decimal" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} aria-label="Cuota" /></Field>
            </div>
            <div className="seg" style={{ marginBottom: 8 }}>
              {(['weekly', 'biweekly', 'monthly'] as const).map((f) => <button key={f} className={freq === f ? 'on' : ''} onClick={() => setFreq(f)}>{FREQ_DEBT_LABEL[f]}</button>)}
            </div>
            <Field label="Primera cuota"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Primera cuota" /></Field>
            <button className="btn primary block" disabled={!parseAmount(planAmount)} onClick={savePlan}>Guardar plan</button>
            {debt.plan && <button className="btn ghost block mt small" onClick={() => { patch((d) => ({ ...d, plan: undefined })); setPlanOpen(false); }}>Quitar el plan</button>}
          </>
        )}
        {sched.length > 0 && (
          <ul className="list plain" style={{ marginTop: 6 }}>
            {(allSched ? sched : sched.slice(0, 6)).map((i) => (
              <li key={i.n} style={{ minHeight: 40, opacity: i.paid ? 0.55 : 1 }}>
                <span className={`tick ${i.paid ? 'on' : ''}`}>{i.paid && <Icon name="check" size={13} stroke={2.6} />}</span>
                <span className="grow small">Cuota {i.n} · {dateFmt(i.date)}{!i.paid && i.date < today() && <b className="neg"> · atrasada</b>}</span>
                <b className="num small">{formatMoney(i.amount, cur)}</b>
              </li>
            ))}
          </ul>
        )}
        {sched.length > 6 && <button className="btn ghost block small" onClick={() => setAllSched(!allSched)}>{allSched ? 'Ver menos' : `Ver las ${sched.length} cuotas`}</button>}
      </div>

      {debt.payments.length > 0 && (
        <div className="card glass flush" style={{ margin: '0 0 12px' }}>
          <ul className="list">
            {[...debt.payments].sort((a, b) => b.date.localeCompare(a.date)).map((p) => (
              <li key={p.id}>
                <div className="grow"><div className="small">{dateFmt(p.date)}{p.txId ? ' · en cuenta' : ''}</div>{p.note && <div className="tiny muted">{p.note}</div>}</div>
                <b className="num">{formatMoney(p.amount, cur)}</b>
                <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => removePayment(p.id)} aria-label="Quitar pago"><Icon name="trash" size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid2">
        <button className="btn tinted" onClick={onEdit}>Editar</button>
        <button className="btn danger" onClick={() => {
          if (!confirm(`¿Eliminar la deuda con ${debt.person}? Los movimientos que anotaste en cuentas se conservan.`)) return;
          update((cur) => ({ ...cur, debts: cur.debts.filter((x) => x.id !== debt.id) }));
          onClose();
        }}><Icon name="trash" size={16} /> Eliminar</button>
      </div>
    </>
  );
}
