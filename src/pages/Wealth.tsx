import { useState } from 'react';
import { netWorth } from '../lib/health';
import { parseAmount, today, uid } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { useStore } from '../store';
import { Bars, Field, Money, Sheet } from '../components/ui';

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: '🏦 Cuentas corrientes',
  savings: '💰 Ahorro',
  cash: '💶 Efectivo',
  investment: '📈 Inversiones',
  crypto: '₿ Criptomonedas',
  card: '💳 Tarjetas de crédito',
  loan: '📉 Préstamos e hipotecas',
};

/** Visión global del patrimonio: todo lo que tienes y lo que debes en un panel. */
export function Wealth() {
  const { data, update } = useStore();
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const nw = netWorth(data);
  const kinds = Object.keys(KIND_LABEL) as AccountKind[];

  return (
    <>
      <div className="card">
        <h2>Patrimonio neto</h2>
        <div className="big">{<Money cents={nw.net} />}</div>
        <div className="small muted">Incluye {data.accounts.length} cuentas. Las huchas ({<Money cents={nw.goals} />}) son dinero ya separado dentro de tus cuentas.</div>
      </div>
      <div className="card">
        <h2>Composición de tus activos</h2>
        <Bars rows={kinds.filter((k) => nw.byKind[k] > 0).map((k) => ({ label: KIND_LABEL[k], value: nw.byKind[k] }))} />
      </div>
      {kinds.map((k) => {
        const accs = data.accounts.filter((a) => a.kind === k);
        if (!accs.length) return null;
        return (
          <div className="card" key={k} style={{ padding: '12px 16px 4px' }}>
            <div className="row between"><h2 style={{ margin: 0 }}>{KIND_LABEL[k]}</h2><Money cents={nw.byKind[k]} /></div>
            <ul className="list">
              {accs.map((a) => (
                <li key={a.id} onClick={() => setEdit(a)} style={{ cursor: 'pointer' }}>
                  <div className="grow">
                    <div>{a.name}</div>
                    <div className="small muted">
                      {a.source === 'manual' ? 'Manual' : a.source === 'import' ? 'Importada' : `Sincronizada${a.lastSync ? ` · ${a.lastSync}` : ''}`}
                      {a.externalId && ` · ${a.externalId}`}
                    </div>
                  </div>
                  <Money cents={a.balance} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <button className="btn block" onClick={() => setEdit({ kind: 'checking', currency: 'EUR', source: 'manual' })}>+ Añadir cuenta, inversión o deuda</button>

      {edit && (
        <Sheet title={edit.id ? 'Editar cuenta' : 'Nueva cuenta'} onClose={() => setEdit(null)}>
          <AccountForm
            value={edit}
            onSave={(a) => {
              update((d) => ({ ...d, accounts: d.accounts.some((x) => x.id === a.id) ? d.accounts.map((x) => (x.id === a.id ? a : x)) : [...d.accounts, a] }));
              setEdit(null);
            }}
            onDelete={
              edit.id
                ? () => {
                    if (!confirm('¿Eliminar la cuenta y todos sus movimientos?')) return;
                    update((d) => ({ ...d, accounts: d.accounts.filter((x) => x.id !== edit.id), transactions: d.transactions.filter((t) => t.accountId !== edit.id) }));
                    setEdit(null);
                  }
                : undefined
            }
          />
        </Sheet>
      )}
    </>
  );
}

function AccountForm({ value, onSave, onDelete }: { value: Partial<Account>; onSave: (a: Account) => void; onDelete?: () => void }) {
  const [name, setName] = useState(value.name ?? '');
  const [kind, setKind] = useState<AccountKind>(value.kind ?? 'checking');
  const [balance, setBalance] = useState(value.balance !== undefined ? String(Math.abs(value.balance) / 100).replace('.', ',') : '');
  const debt = kind === 'loan' || kind === 'card';
  const cents = parseAmount(balance) ?? 0;
  return (
    <>
      <Field label="Tipo">
        <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="Nombre"><input value={name} placeholder="BBVA, Indexa, Binance, Hipoteca…" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={debt ? 'Deuda pendiente (€)' : 'Saldo / valor actual (€)'}><input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} /></Field>
      {value.source && value.source !== 'manual' && value.source !== 'import' && <p className="small muted">El saldo de esta cuenta lo actualiza el banco al sincronizar.</p>}
      <button
        className="btn primary block"
        disabled={!name}
        onClick={() => onSave({ id: value.id ?? uid(), name, kind, balance: debt ? -Math.abs(cents) : cents, currency: value.currency ?? 'EUR', source: value.source ?? 'manual', externalId: value.externalId, lastSync: value.source === 'manual' ? today() : value.lastSync })}
      >
        Guardar
      </button>
      {onDelete && <button className="btn danger block" style={{ marginTop: 8 }} onClick={onDelete}>Eliminar cuenta</button>}
    </>
  );
}
