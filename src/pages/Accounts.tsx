import { useState } from 'react';
import { AccountForm } from '../components/AccountForm';
import { AccountLogo, KIND_LABEL } from '../components/AccountLogo';
import { Icon } from '../components/icons';
import { Sheet } from '../components/ui';
import { accountBase, accountStatus } from '../lib/fx';
import { netWorth } from '../lib/health';
import { daysBetween, formatMoney, today } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { useStore } from '../store';

const GROUPS: { title: string; kinds: AccountKind[] }[] = [
  { title: 'Dinero disponible', kinds: ['checking', 'savings', 'cash'] },
  { title: 'Inversiones', kinds: ['investment', 'crypto'] },
  { title: 'Deudas', kinds: ['card', 'loan'] },
];

const DATE_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** «Hoy», «ayer», «hace 5 días» o la fecha, con un tono según lo reciente que sea. */
function freshness(date?: string): { text: string; tone: 'good' | 'warn' | 'muted' } {
  if (!date) return { text: 'Sin movimientos', tone: 'muted' };
  const days = daysBetween(date, today());
  if (days <= 0) return { text: 'Actualizada hoy', tone: 'good' };
  if (days === 1) return { text: 'Actualizada ayer', tone: 'good' };
  if (days <= 7) return { text: `Actualizada hace ${days} días`, tone: 'good' };
  if (days <= 30) return { text: `Actualizada el ${DATE_FMT.format(new Date(`${date}T12:00:00`))}`, tone: 'warn' };
  return { text: `Sin actividad desde el ${DATE_FMT.format(new Date(`${date}T12:00:00`))}`, tone: 'muted' };
}

/** Estado de todas tus cuentas, con su logo, saldo, equivalente y cuándo se movieron por última vez. */
export function Accounts({ onView, onAdd }: { onView: (accountId: string) => void; onAdd: () => void }) {
  const { data, update } = useStore();
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const base = data.settings.currency;
  const now = today();
  const nw = netWorth(data);

  const card = (a: Account) => {
    const st = accountStatus(data, a);
    const fr = freshness(st.lastActivity);
    const eq = a.currency !== base ? accountBase(data, a, now) : null;
    return (
      <div key={a.id} className="card glass acc-card">
        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <AccountLogo account={a} size={48} />
          <div className="grow">
            <div className="ellipsis"><b>{a.name}</b></div>
            <div className="small muted ellipsis">{KIND_LABEL[a.kind]} · {a.currency}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mid num" style={{ fontSize: 19 }}>{formatMoney(a.balance, a.currency)}</div>
            {eq !== null && <div className="tiny muted">≈ {formatMoney(eq, base)}</div>}
          </div>
        </div>
        <div className="row small" style={{ marginTop: 10, gap: 8 }}>
          <span className={`acc-dot ${fr.tone}`} />
          <span className={fr.tone === 'good' ? '' : 'muted'}>{fr.text}</span>
          <span className="muted">· {st.movements} mov.</span>
        </div>
        <div className="grid2 mt" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => onView(a.id)}>Ver movimientos</button>
          <button className="btn sm tinted" onClick={() => setEdit(a)}>Editar</button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="hero glass">
        <div className="small secondary">Total en cuentas · {base}</div>
        <div className="big" style={{ fontSize: 38 }}>{formatMoney(nw.liquid, base)}</div>
        <div className="small secondary">Patrimonio neto {formatMoney(nw.net, base)} · {data.accounts.length} cuentas</div>
      </div>

      {GROUPS.map((g) => {
        const accs = data.accounts.filter((a) => g.kinds.includes(a.kind));
        if (!accs.length) return null;
        const sub = accs.reduce((s, a) => s + accountBase(data, a, now), 0);
        return (
          <div key={g.title}>
            <div className="section-title row between"><span>{g.title}</span><span className="num">{formatMoney(sub, base)}</span></div>
            {accs.map(card)}
          </div>
        );
      })}

      <div className="grid2">
        <button className="btn glass block" onClick={() => setEdit({ kind: 'checking', currency: base, source: 'manual' })}><Icon name="plus" size={18} /> Nueva cuenta</button>
        <button className="btn glass block" onClick={onAdd}><Icon name="plus" size={18} /> Movimiento</button>
      </div>
      <p className="tiny muted center">Toca «Editar» para actualizar el saldo, cambiar el nombre o ponerle el logo de tu banco.</p>

      {edit && (
        <Sheet title={edit.id ? 'Editar cuenta' : 'Nueva cuenta'} onClose={() => setEdit(null)}>
          <AccountForm
            value={edit}
            onSave={(a) => {
              update((d) => ({ ...d, accounts: d.accounts.some((x) => x.id === a.id) ? d.accounts.map((x) => (x.id === a.id ? a : x)) : [...d.accounts, a] }));
              setEdit(null);
            }}
            onDelete={edit.id ? () => {
              if (!confirm('¿Eliminar la cuenta y todos sus movimientos?')) return;
              update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== edit.id), transactions: d.transactions.filter((t) => t.accountId !== edit.id) }));
              setEdit(null);
            } : undefined}
          />
        </Sheet>
      )}
    </>
  );
}
