import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { Empty, Field, Money, Sheet, toast } from '../components/ui';
import { acceptInvite, cancelInvite, createGroup, declineInvite, deleteEntry, inviteByEmail, leaveGroup, loadEntries, loadGroupInvites, loadGroups, pendingInvites, saveEntry, toSharedExpenses, watchShared, type CloudEntry, type CloudGroup, type PendingInvite } from '../lib/cloudShared';
import { CURRENCIES } from '../lib/fx';
import { formatMoney, parseAmount, today } from '../lib/money';
import { balances, settleUp, splitByWeights, splitEqual } from '../lib/shared';
import { getSupabaseConfig, supabase } from '../lib/sync';
import { useStore } from '../store';

/** Gastos y deudas compartidos con otras personas (p. ej. «Hogar» con tu pareja), sincronizados entre sus cuentas. */
export function CloudGroups({ go }: { go: (page: 'settings') => void }) {
  const store = useStore();
  const sb = supabase();
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [groups, setGroups] = useState<CloudGroup[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [entries, setEntries] = useState<CloudEntry[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<'group' | 'expense' | 'debt' | 'invite' | { edit: CloudEntry } | null>(null);
  const group = groups.find((g) => g.id === openId) ?? groups[0];

  const refresh = useCallback(async () => {
    if (!sb) return;
    try {
      const [gs, inv] = await Promise.all([loadGroups(sb), pendingInvites(sb)]);
      setGroups(gs);
      setInvites(inv);
      setError('');
    } catch (e) {
      const m = (e as Error).message;
      setError(/does not exist|schema cache|relation|function/i.test(m) ? 'Falta activar los gastos compartidos en el servidor: ejecuta supabase/migrations/20261104000000_compartidos.sql en el SQL Editor de Supabase.' : m);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    if (!sb || !store.account) return;
    void sb.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) setMe({ id: u.id, name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email?.split('@')[0] ?? 'Yo') });
    });
    void refresh();
    return watchShared(sb, () => void refresh());
  }, [sb, store.account, refresh]);

  useEffect(() => {
    if (!sb || !group) return setEntries([]);
    const load = () => void loadEntries(sb, group.id).then(setEntries).catch(() => undefined);
    load();
    return watchShared(sb, load);
  }, [sb, group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!getSupabaseConfig() || !sb) return <Empty>La sincronización no está configurada en esta instalación.</Empty>;
  if (!store.account) {
    return (
      <div className="card glass">
        <p className="small" style={{ marginTop: 0 }}><b>Inicia sesión para compartir gastos y deudas con otras personas.</b> Cada uno entra con su cuenta y ambos ven lo mismo, al momento.</p>
        <button className="btn primary block" onClick={() => go('settings')}>Iniciar sesión</button>
      </div>
    );
  }

  const nameOf = (id: string) => group?.members.find((m) => m.userId === id)?.displayName ?? 'Ex-miembro';
  const expenses = toSharedExpenses(entries);
  const memberIds = group?.members.map((m) => m.userId) ?? [];
  const bal = balances(expenses, memberIds);
  const transfers = settleUp(bal);
  const total = entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
  const cur = group?.currency ?? 'USD';
  const mine = me ? bal[me.id] ?? 0 : 0;

  const accept = async (inv: PendingInvite) => {
    try {
      await acceptInvite(sb, inv.groupId, me?.name ?? 'Yo');
      toast(`Te has unido a «${inv.groupName}»`);
      setOpenId(inv.groupId);
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const settle = async (from: string, to: string, amount: number) => {
    if (!me) return;
    try {
      await saveEntry(sb, { groupId: group!.id, kind: 'payment', payer: from, amount, description: `${nameOf(from)} paga a ${nameOf(to)}`, date: today(), shares: { [to]: amount } }, me.id);
      setEntries(await loadEntries(sb, group!.id));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      {error && <div className="alert warning small"><Icon name="alert" size={18} /><div>{error}</div></div>}

      {invites.map((inv) => (
        <div key={inv.groupId} className="card glass row" style={{ padding: 14 }}>
          <span className="icon accent"><Icon name="users" size={20} /></span>
          <div className="grow small"><b>{inv.invitedBy} te invitó a «{inv.groupName}»</b><div className="muted">Verás los gastos y deudas del grupo.</div></div>
          <button className="btn primary sm" onClick={() => void accept(inv)}>Unirme</button>
          <button className="btn ghost sm" onClick={() => void declineInvite(sb, inv.groupId, store.account ?? '').then(refresh)}>No</button>
        </div>
      ))}

      <div className="chips" style={{ marginBottom: 12 }}>
        {groups.map((g) => <button key={g.id} className={`chip ${g.id === group?.id ? 'on' : ''}`} onClick={() => setOpenId(g.id)}>{g.name}</button>)}
        <button className="chip" onClick={() => setSheet('group')}>+ Grupo</button>
      </div>

      {loading && <p className="small muted center">Cargando…</p>}
      {!loading && !group && !error && <Empty>Crea un grupo (por ejemplo «Hogar»), invita a tu pareja con su correo y anota lo que paga cada uno. Ambos lo veréis a la vez.</Empty>}

      {group && me && (
        <>
          <div className="card glass">
            <div className="card-head"><h2>{group.name} · {formatMoney(total, cur)} en gastos</h2><button className="btn ghost sm" onClick={() => setSheet('invite')}><Icon name="plus" size={14} /> Invitar</button></div>
            <p className="small muted" style={{ margin: '0 0 8px' }}>Miembros: {group.members.map((m) => m.displayName).join(', ')}</p>
            <div className={`mid ${mine > 0 ? 'pos' : mine < 0 ? 'neg' : ''}`}>{mine > 0 ? `Te deben ${formatMoney(mine, cur)}` : mine < 0 ? `Debes ${formatMoney(-mine, cur)}` : 'Estáis en paz'}</div>
            <ul className="list plain" style={{ marginTop: 8 }}>
              {transfers.map((t) => (
                <li key={`${t.from}-${t.to}`} style={{ minHeight: 48 }}>
                  <span className="grow small"><b>{t.from === me.id ? 'Tú' : nameOf(t.from)}</b> {t.from === me.id ? 'debes' : 'debe'} <b>{formatMoney(t.amount, cur)}</b> a <b>{t.to === me.id ? 'ti' : nameOf(t.to)}</b></span>
                  <button className="btn sm tinted" onClick={() => void settle(t.from, t.to, t.amount)}>Saldado</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid2 mb">
            <button className="btn primary" onClick={() => setSheet('expense')}><Icon name="plus" size={18} /> Gasto</button>
            <button className="btn tinted" onClick={() => setSheet('debt')}><Icon name="swap" size={18} /> Deuda</button>
          </div>

          <div className="card glass flush">
            {entries.length === 0 && <Empty>Aún no hay movimientos.</Empty>}
            <ul className="list">
              {entries.map((e) => {
                const myShare = e.shares[me.id] ?? 0;
                return (
                  <li key={e.id} className={e.createdBy === me.id ? 'tap' : ''} onClick={() => e.createdBy === me.id && setSheet({ edit: e })}>
                    <span className="icon"><Icon name={e.kind === 'payment' ? 'check' : e.kind === 'debt' ? 'swap' : 'receipt'} size={19} /></span>
                    <div className="grow">
                      <div className="ellipsis">{e.description || (e.kind === 'debt' ? 'Deuda' : 'Gasto')}</div>
                      <div className="small muted ellipsis">{e.date} · {e.kind === 'debt' ? 'Deuda' : e.kind === 'payment' ? 'Pago' : 'Pagó'} {nameOf(e.payer)}{myShare ? ` · tu parte ${formatMoney(myShare, cur)}` : ''}</div>
                    </div>
                    <Money cents={e.amount} currency={cur} />
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="tiny muted center">Los gastos compartidos se guardan en el servidor para que los vean los miembros del grupo (no van cifrados de extremo a extremo como tus datos personales).</p>
          <button className="btn ghost block small" onClick={async () => { if (confirm(`¿Salir de «${group.name}»?`)) { await leaveGroup(sb, group.id, me.id).catch((e: Error) => toast(e.message)); setOpenId(null); void refresh(); } }}>Salir del grupo</button>
        </>
      )}

      {sheet === 'group' && me && (
        <Sheet title="Nuevo grupo compartido" onClose={() => setSheet(null)}>
          <NewCloudGroup defaultName={me.name} base={store.data.settings.currency} onSave={async (name, currency, display) => {
            try {
              const id = await createGroup(sb, name, currency, display);
              setOpenId(id);
              setSheet(null);
              await refresh();
              toast('Grupo creado: invita a la otra persona con su correo');
            } catch (e) {
              toast((e as Error).message);
            }
          }} />
        </Sheet>
      )}
      {sheet === 'invite' && group && me && <InviteSheet group={group} meId={me.id} onClose={() => setSheet(null)} />}
      {(sheet === 'expense' || sheet === 'debt' || (typeof sheet === 'object' && sheet && 'edit' in sheet)) && group && me && (
        <Sheet title={sheet === 'debt' ? 'Nueva deuda' : typeof sheet === 'object' && sheet ? 'Editar movimiento' : 'Nuevo gasto compartido'} onClose={() => setSheet(null)}>
          <EntryForm
            group={group}
            meId={me.id}
            mode={sheet === 'debt' || (typeof sheet === 'object' && sheet && sheet.edit.kind === 'debt') ? 'debt' : 'expense'}
            existing={typeof sheet === 'object' && sheet ? sheet.edit : undefined}
            onSave={async (e) => {
              try {
                await saveEntry(sb, e, me.id);
                setEntries(await loadEntries(sb, group.id));
                setSheet(null);
              } catch (err) {
                toast((err as Error).message);
              }
            }}
            onDelete={typeof sheet === 'object' && sheet ? async () => { if (confirm('¿Eliminar este movimiento?')) { await deleteEntry(sb, sheet.edit.id).catch((e: Error) => toast(e.message)); setEntries(await loadEntries(sb, group.id)); setSheet(null); } } : undefined}
          />
        </Sheet>
      )}
    </>
  );
}

function NewCloudGroup({ defaultName, base, onSave }: { defaultName: string; base: string; onSave: (name: string, currency: string, display: string) => void }) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(base);
  const [display, setDisplay] = useState(defaultName);
  return (
    <>
      <Field label="Nombre del grupo"><input value={name} placeholder="Hogar, Viaje, Pareja…" onChange={(e) => setName(e.target.value)} aria-label="Nombre del grupo" /></Field>
      <div className="grid2">
        <Field label="Moneda del grupo"><select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.filter((c) => !c.custom).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}</select></Field>
        <Field label="Tu nombre en el grupo"><input value={display} onChange={(e) => setDisplay(e.target.value)} aria-label="Tu nombre en el grupo" /></Field>
      </div>
      <button className="btn primary block" disabled={!name.trim()} onClick={() => onSave(name.trim(), currency, display.trim())}>Crear grupo</button>
    </>
  );
}

function InviteSheet({ group, meId, onClose }: { group: CloudGroup; meId: string; onClose: () => void }) {
  const sb = supabase()!;
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<{ id: string; email: string }[]>([]);
  const load = useCallback(() => void loadGroupInvites(sb, group.id).then(setPending).catch(() => undefined), [sb, group.id]);
  useEffect(load, [load]);
  const send = async () => {
    try {
      await inviteByEmail(sb, group.id, email, meId);
      toast('Invitación enviada: cuando entre con ese correo la verá en Compartir');
      setEmail('');
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Sheet title="Invitar al grupo" onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>Escribe el correo con el que la otra persona usa Finanzas (o usará). Al entrar con ese correo verá la invitación.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input type="email" placeholder="nicole@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo de la persona" />
        <button className="btn primary" disabled={!/.+@.+\..+/.test(email)}>Invitar</button>
      </form>
      {pending.length > 0 && (
        <>
          <div className="section-title">Pendientes</div>
          <ul className="list plain">{pending.map((p) => <li key={p.id}><span className="grow small">{p.email}</span><button className="btn ghost sm" onClick={() => void cancelInvite(sb, p.id).then(load)}>Cancelar</button></li>)}</ul>
        </>
      )}
    </Sheet>
  );
}

/** Gasto (reparto entre miembros) o deuda directa («yo le debo a…» / «me debe…»). */
function EntryForm({ group, meId, mode, existing, onSave, onDelete }: { group: CloudGroup; meId: string; mode: 'expense' | 'debt'; existing?: CloudEntry; onSave: (e: Omit<CloudEntry, 'id' | 'createdAt' | 'createdBy'> & { id?: string }) => void; onDelete?: () => void }) {
  const others = group.members.filter((m) => m.userId !== meId);
  const [description, setDescription] = useState(existing?.description ?? '');
  const [amount, setAmount] = useState(existing ? String(existing.amount / 100).replace('.', ',') : '');
  const [date, setDate] = useState(existing?.date ?? today());
  const cents = Math.abs(parseAmount(amount) ?? 0);
  // Gasto
  const [paidBy, setPaidBy] = useState(existing?.payer ?? meId);
  const [split, setSplit] = useState<'equal' | 'weights'>('equal');
  const [included, setIncluded] = useState<string[]>(existing ? Object.keys(existing.shares) : group.members.map((m) => m.userId));
  const [weights, setWeights] = useState<Record<string, number>>(Object.fromEntries(group.members.map((m) => [m.userId, 1])));
  // Deuda
  const iOwe = existing ? existing.payer !== meId : true;
  const [direction, setDirection] = useState<'iowe' | 'owesme'>(iOwe ? 'iowe' : 'owesme');
  const [other, setOther] = useState(existing ? (existing.payer === meId ? Object.keys(existing.shares)[0] : existing.payer) : others[0]?.userId ?? '');
  const shares = useMemo(() => (split === 'equal' ? (included.length ? splitEqual(cents, included) : {}) : splitByWeights(cents, weights)), [split, included, weights, cents]);
  const nameOf = (id: string) => group.members.find((m) => m.userId === id)?.displayName ?? '—';

  if (mode === 'debt') {
    return (
      <>
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={direction === 'iowe' ? 'on' : ''} onClick={() => setDirection('iowe')}>Yo le debo a…</button>
          <button className={direction === 'owesme' ? 'on' : ''} onClick={() => setDirection('owesme')}>Me debe…</button>
        </div>
        {others.length === 0 ? <p className="small muted">Invita primero a la otra persona al grupo.</p> : (
          <Field label="Persona"><select value={other} onChange={(e) => setOther(e.target.value)} aria-label="Persona">{others.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}</select></Field>
        )}
        <div className="grid2">
          <Field label={`Importe (${group.currency})`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" /></Field>
          <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Concepto"><input value={description} placeholder="Préstamo, alquiler, cena…" onChange={(e) => setDescription(e.target.value)} aria-label="Concepto" /></Field>
        <button className="btn primary block" disabled={!cents || !other} onClick={() => onSave({ id: existing?.id, groupId: group.id, kind: 'debt', payer: direction === 'iowe' ? other : meId, amount: cents, description: description || (direction === 'iowe' ? `Debo a ${nameOf(other)}` : `${nameOf(other)} me debe`), date, shares: { [direction === 'iowe' ? meId : other]: cents } })}>Guardar</button>
        {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar</button>}
      </>
    );
  }

  return (
    <>
      <Field label="Concepto"><input value={description} placeholder="Súper, alquiler, luz…" onChange={(e) => setDescription(e.target.value)} aria-label="Concepto" /></Field>
      <div className="grid2">
        <Field label={`Importe (${group.currency})`}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Importe" /></Field>
        <Field label="Pagó"><select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} aria-label="Quién pagó">{group.members.map((m) => <option key={m.userId} value={m.userId}>{m.userId === meId ? `${m.displayName} (tú)` : m.displayName}</option>)}</select></Field>
      </div>
      <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="seg">
        <button className={split === 'equal' ? 'on' : ''} onClick={() => setSplit('equal')}>A partes iguales</button>
        <button className={split === 'weights' ? 'on' : ''} onClick={() => setSplit('weights')}>Por partes / %</button>
      </div>
      <ul className="list">
        {group.members.map((m) => (
          <li key={m.userId}>
            {split === 'equal' ? (
              <label className="check grow" style={{ margin: 0 }}>
                <input type="checkbox" checked={included.includes(m.userId)} onChange={(e) => setIncluded(e.target.checked ? [...included, m.userId] : included.filter((x) => x !== m.userId))} />
                {m.displayName}
              </label>
            ) : (
              <>
                <span className="grow">{m.displayName}</span>
                <input type="number" min={0} style={{ width: 80 }} value={weights[m.userId]} onChange={(e) => setWeights({ ...weights, [m.userId]: Math.max(0, Number(e.target.value)) })} aria-label={`Partes de ${m.displayName}`} />
              </>
            )}
            <Money cents={shares[m.userId] ?? 0} currency={group.currency} />
          </li>
        ))}
      </ul>
      <button className="btn primary block" style={{ marginTop: 12 }} disabled={!cents || !Object.keys(shares).length} onClick={() => onSave({ id: existing?.id, groupId: group.id, kind: 'expense', payer: paidBy, amount: cents, description: description || 'Gasto', date, shares })}>Guardar</button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar</button>}
    </>
  );
}
