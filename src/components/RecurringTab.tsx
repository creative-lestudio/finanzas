import { useMemo, useState } from 'react';
import { toBase } from '../lib/fx';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import { FREQ_LABEL, monthlyEquivalent } from '../lib/recurring';
import type { Recurring } from '../lib/types';
import { useStore } from '../store';
import { CategoryPicker } from './CategoryPicker';
import { CatBadge, Icon } from './icons';
import { Empty, Sheet, toast } from './ui';

const FREQS: Recurring['freq'][] = ['weekly', 'monthly', 'yearly'];

/** Movimientos que se repiten solos: alquiler, nómina, gimnasio… */
export function RecurringTab() {
  const { data, update } = useStore();
  const [edit, setEdit] = useState<Partial<Recurring> | null>(null);
  const base = data.settings.currency;
  const rules = [...(data.recurring ?? [])].sort((a, b) => a.next.localeCompare(b.next));
  const cur = (id: string) => data.accounts.find((a) => a.id === id)?.currency ?? base;
  const monthly = useMemo(() => {
    let out = 0, inc = 0;
    for (const r of rules.filter((x) => x.active)) {
      const v = toBase(data, monthlyEquivalent(r), cur(r.accountId), today());
      if (v < 0) out += v; else inc += v;
    }
    return { out, inc };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="card glass">
        <h2>Cada mes, sin que lo anotes</h2>
        <div className="grid2">
          <div><div className="tiny muted">Gastos fijos</div><div className="mid neg">{formatMoney(monthly.out, base)}</div></div>
          <div><div className="tiny muted">Ingresos fijos</div><div className="mid pos">{formatMoney(monthly.inc, base)}</div></div>
        </div>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Se crean solos el día que tocan, en la cuenta que elijas. Aparecen en Movimientos con el icono de repetición.</p>
      </div>

      {rules.length === 0 ? (
        <Empty>Anota una vez el alquiler, Netflix, el gimnasio o tu sueldo y se repetirán solos.</Empty>
      ) : (
        <div className="card glass flush">
          <ul className="list">
            {rules.map((r) => (
              <li key={r.id} className="tap" onClick={() => setEdit(r)} style={{ opacity: r.active ? 1 : 0.55 }}>
                <CatBadge id={r.categoryId} />
                <div className="grow">
                  <div className="ellipsis">{r.description}</div>
                  <div className="small muted">{FREQ_LABEL[r.freq]} · {r.active ? `próximo ${new Date(`${r.next}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'en pausa'} · {data.accounts.find((a) => a.id === r.accountId)?.name}</div>
                </div>
                <b className={`num ${r.amount < 0 ? 'neg' : 'pos'}`}>{formatMoney(r.amount, cur(r.accountId))}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn block glass" onClick={() => setEdit({ freq: 'monthly', active: true, next: today() })}><Icon name="plus" size={18} /> Nuevo recurrente</button>

      {edit && (
        <Sheet title={edit.id ? 'Editar recurrente' : 'Nuevo recurrente'} onClose={() => setEdit(null)}>
          <RecurringForm
            value={edit}
            onSave={(r) => {
              update((d) => ({ ...d, recurring: r.id && (d.recurring ?? []).some((x) => x.id === r.id) ? (d.recurring ?? []).map((x) => (x.id === r.id ? r : x)) : [...(d.recurring ?? []), { ...r, id: uid() }] }));
              toast(r.next <= today() ? 'Guardado: se crean ahora los movimientos pendientes.' : 'Recurrente guardado.');
              setEdit(null);
            }}
            onDelete={edit.id ? () => { update((d) => ({ ...d, recurring: (d.recurring ?? []).filter((x) => x.id !== edit.id) })); toast('Eliminado. Los movimientos ya creados se conservan.'); setEdit(null); } : undefined}
          />
        </Sheet>
      )}
    </>
  );
}

function RecurringForm({ value, onSave, onDelete }: { value: Partial<Recurring>; onSave: (r: Recurring) => void; onDelete?: () => void }) {
  const { data } = useStore();
  const usable = data.accounts.filter((a) => a.kind !== 'investment' && a.kind !== 'crypto' && a.kind !== 'loan');
  const [kind, setKind] = useState<'expense' | 'income'>((value.amount ?? -1) >= 0 && value.amount !== undefined ? 'income' : 'expense');
  const [amount, setAmount] = useState(value.amount ? String(Math.abs(value.amount) / 100).replace('.', ',') : '');
  const [description, setDescription] = useState(value.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(value.categoryId ?? null);
  const [accountId, setAccountId] = useState(value.accountId ?? usable[0]?.id ?? '');
  const [freq, setFreq] = useState<Recurring['freq']>(value.freq ?? 'monthly');
  const [next, setNext] = useState(value.next ?? today());
  const [end, setEnd] = useState(value.end ?? '');
  const [active, setActive] = useState(value.active ?? true);
  const cents = parseAmount(amount);
  const currency = data.accounts.find((a) => a.id === accountId)?.currency ?? data.settings.currency;
  const ok = !!cents && cents > 0 && !!categoryId && !!accountId && description.trim().length > 0;

  return (
    <>
      <div className="seg">
        <button className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setCategoryId(null); }}>Gasto</button>
        <button className={kind === 'income' ? 'on' : ''} onClick={() => { setKind('income'); setCategoryId(null); }}>Ingreso</button>
      </div>
      <div className="field"><input placeholder="Nombre: alquiler, Netflix, nómina…" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Nombre" /></div>
      <div className="amount-wrap">
        <input className="amount-input" inputMode="decimal" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" style={{ width: `${Math.max(2, amount.length + 1)}ch`, maxWidth: '80%' }} />
        <span className="cur">{currency}</span>
      </div>
      <CategoryPicker kind={kind} value={categoryId} onChange={setCategoryId} />
      <div className="field">
        <label>Cuenta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {usable.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
          </select>
        </label>
      </div>
      <div className="seg" role="group" aria-label="Frecuencia">
        {FREQS.map((f) => <button key={f} className={freq === f ? 'on' : ''} onClick={() => setFreq(f)}>{FREQ_LABEL[f]}</button>)}
      </div>
      <div className="grid2">
        <div className="field"><label>{value.id ? 'Próxima fecha' : 'Primera fecha'}<input type="date" value={next} onChange={(e) => setNext(e.target.value)} /></label></div>
        <div className="field"><label>Hasta (opcional)<input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
      </div>
      {value.id && (
        <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo (desmárcalo para pausarlo)</label>
      )}
      {next < today() && !value.id && <p className="tiny muted">La fecha ya pasó: se crearán los movimientos pendientes desde esa fecha hasta hoy.</p>}
      <button className="btn primary block mt" disabled={!ok} onClick={() => onSave({ id: value.id ?? '', accountId, amount: kind === 'expense' ? -Math.abs(cents!) : Math.abs(cents!), description: description.trim(), categoryId: categoryId!, freq, next, day: Number(next.slice(8)), end: end || undefined, active })}>Guardar</button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar</button>}
    </>
  );
}
