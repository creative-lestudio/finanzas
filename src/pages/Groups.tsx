import { useState } from 'react';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import { balances, settleUp, splitByWeights, splitEqual } from '../lib/shared';
import type { Group } from '../lib/types';
import { useStore } from '../store';
import { Empty, Field, Money, Sheet } from '../components/ui';

/** Gastos compartidos estilo Splitwise / Settle Up. */
export function Groups() {
  const { data, update } = useStore();
  const [openId, setOpenId] = useState<string | null>(data.groups[0]?.id ?? null);
  const [newGroup, setNewGroup] = useState(false);
  const [adding, setAdding] = useState(false);
  const group = data.groups.find((g) => g.id === openId);

  return (
    <>
      <div className="chips" style={{ marginBottom: 12 }}>
        {data.groups.map((g) => (
          <button key={g.id} className={`chip ${g.id === openId ? 'on' : ''}`} onClick={() => setOpenId(g.id)}>{g.name}</button>
        ))}
        <button className="chip" onClick={() => setNewGroup(true)}>+ Grupo</button>
      </div>
      {!group && <Empty>Crea un grupo para dividir gastos con tu pareja, familia o amigos.</Empty>}
      {group && <GroupView group={group} onAdd={() => setAdding(true)} />}

      {newGroup && (
        <Sheet title="Nuevo grupo" onClose={() => setNewGroup(false)}>
          <NewGroup
            onSave={(g) => {
              update((d) => ({ ...d, groups: [...d.groups, g] }));
              setOpenId(g.id);
              setNewGroup(false);
            }}
          />
        </Sheet>
      )}
      {adding && group && (
        <Sheet title="Nuevo gasto compartido" onClose={() => setAdding(false)}>
          <AddShared group={group} onDone={() => setAdding(false)} />
        </Sheet>
      )}
    </>
  );
}

function GroupView({ group, onAdd }: { group: Group; onAdd: () => void }) {
  const { data, update } = useStore();
  const expenses = data.sharedExpenses.filter((e) => e.groupId === group.id).sort((a, b) => b.date.localeCompare(a.date));
  const bal = balances(expenses, group.members);
  const transfers = settleUp(bal);
  const total = expenses.filter((e) => !e.settlement).reduce((s, e) => s + e.amount, 0);

  const settle = (from: string, to: string, amount: number) =>
    update((d) => ({
      ...d,
      sharedExpenses: [
        ...d.sharedExpenses,
        { id: uid(), groupId: group.id, date: today(), description: `${from} paga a ${to}`, amount, paidBy: from, shares: { [to]: amount }, settlement: true },
      ],
    }));

  return (
    <>
      <div className="card glass">
        <h2>Saldos · gasto total {formatMoney(total)}</h2>
        <ul className="list">
          {group.members.map((m) => (
            <li key={m}>
              <span className="grow">{m}</span>
              <span className={`num ${bal[m] > 0 ? 'pos' : ''}`} style={bal[m] < 0 ? { color: 'var(--bad)' } : undefined}>
                {bal[m] > 0 ? `le deben ${formatMoney(bal[m])}` : bal[m] < 0 ? `debe ${formatMoney(-bal[m])}` : 'en paz'}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {transfers.length > 0 && (
        <div className="card glass">
          <h2>Para quedar en paz</h2>
          <ul className="list">
            {transfers.map((t) => (
              <li key={`${t.from}-${t.to}`}>
                <span className="grow small"><b>{t.from}</b> → <b>{t.to}</b></span>
                <Money cents={t.amount} />
                <button className="btn small" onClick={() => settle(t.from, t.to, t.amount)}>Saldado</button>
              </li>
            ))}
          </ul>
          <p className="small muted" style={{ marginBottom: 0 }}>Consejo: puedes pagar por Bizum y marcarlo como saldado.</p>
        </div>
      )}
      <button className="btn primary block mb" onClick={onAdd}>+ Añadir gasto</button>
      <div className="card glass flush">
        {expenses.length === 0 && <Empty>Sin gastos en este grupo.</Empty>}
        <ul className="list">
          {expenses.map((e) => (
            <li key={e.id}>
              <span className="icon">{e.settlement ? '🤝' : '🧾'}</span>
              <div className="grow">
                <div className="ellipsis">{e.description}</div>
                <div className="small muted">{e.date} · pagó {e.paidBy}</div>
              </div>
              <Money cents={e.amount} />
              <button className="btn ghost small" aria-label="Eliminar" onClick={() => update((d) => ({ ...d, sharedExpenses: d.sharedExpenses.filter((x) => x.id !== e.id) }))}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function NewGroup({ onSave }: { onSave: (g: Group) => void }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState('Yo, ');
  const list = members.split(',').map((m) => m.trim()).filter(Boolean);
  return (
    <>
      <Field label="Nombre del grupo"><input value={name} placeholder="Viaje a Lisboa" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Miembros (separados por comas)"><input value={members} onChange={(e) => setMembers(e.target.value)} /></Field>
      <button className="btn primary block" disabled={!name || list.length < 2} onClick={() => onSave({ id: uid(), name, members: [...new Set(list)] })}>Crear grupo</button>
    </>
  );
}

function AddShared({ group, onDone }: { group: Group; onDone: () => void }) {
  const { update } = useStore();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(group.members[0]);
  const [mode, setMode] = useState<'equal' | 'weights'>('equal');
  const [included, setIncluded] = useState<string[]>(group.members);
  const [weights, setWeights] = useState<Record<string, number>>(Object.fromEntries(group.members.map((m) => [m, 1])));
  const cents = Math.abs(parseAmount(amount) ?? 0);
  const shares = mode === 'equal' ? (included.length ? splitEqual(cents, included) : {}) : splitByWeights(cents, weights);

  return (
    <>
      <Field label="Concepto"><input value={description} placeholder="Cena, súper, gasolina…" onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="grid2">
        <Field label="Importe (€)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Pagó">
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>{group.members.map((m) => <option key={m}>{m}</option>)}</select>
        </Field>
      </div>
      <div className="seg">
        <button className={mode === 'equal' ? 'on' : ''} onClick={() => setMode('equal')}>A partes iguales</button>
        <button className={mode === 'weights' ? 'on' : ''} onClick={() => setMode('weights')}>Por partes / %</button>
      </div>
      <ul className="list">
        {group.members.map((m) => (
          <li key={m}>
            {mode === 'equal' ? (
              <label className="check grow" style={{ margin: 0 }}>
                <input type="checkbox" checked={included.includes(m)} onChange={(e) => setIncluded(e.target.checked ? [...included, m] : included.filter((x) => x !== m))} />
                {m}
              </label>
            ) : (
              <>
                <span className="grow">{m}</span>
                <input type="number" min={0} style={{ width: 80 }} value={weights[m]} onChange={(e) => setWeights({ ...weights, [m]: Math.max(0, Number(e.target.value)) })} aria-label={`Partes de ${m}`} />
              </>
            )}
            <Money cents={shares[m] ?? 0} />
          </li>
        ))}
      </ul>
      <button
        className="btn primary block"
        style={{ marginTop: 12 }}
        disabled={!cents || !description || !Object.keys(shares).length}
        onClick={() => {
          update((d) => ({ ...d, sharedExpenses: [...d.sharedExpenses, { id: uid(), groupId: group.id, date: today(), description, amount: cents, paidBy, shares }] }));
          onDone();
        }}
      >
        Guardar
      </button>
    </>
  );
}
