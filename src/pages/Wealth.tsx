import { useState } from 'react';
import { Icon } from '../components/icons';
import { Bars, Field, Money, Sheet } from '../components/ui';
import { CURRENCIES, toBase } from '../lib/fx';
import { netWorth } from '../lib/health';
import { formatMoney, parseAmount, today, uid } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { useStore } from '../store';

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: '🏦 Cuentas corrientes',
  savings: '💰 Ahorro',
  cash: '💶 Efectivo',
  investment: '📈 Inversiones',
  crypto: '₿ Criptomonedas',
  card: '💳 Tarjetas de crédito',
  loan: '📉 Préstamos e hipotecas',
};

/** Visión global del patrimonio: todo lo que tienes y lo que debes, en tu moneda principal. */
export function Wealth() {
  const { data, update } = useStore();
  const [edit, setEdit] = useState<Partial<Account> | null>(null);
  const nw = netWorth(data);
  const kinds = Object.keys(KIND_LABEL) as AccountKind[];
  const base = data.settings.currency;
  const date = today();

  return (
    <>
      <div className="hero glass">
        <div className="small secondary">Patrimonio neto · {base}</div>
        <div className="big" style={{ fontSize: 40 }}>{formatMoney(nw.net, base)}</div>
        <div className="row small secondary wrap" style={{ gap: 14 }}>
          <span>Activos <Money cents={nw.assets} /></span>
          <span>Deudas <Money cents={-nw.liabilities} /></span>
          <span>Liquidez <Money cents={nw.liquid} /></span>
        </div>
      </div>
      <div className="card glass">
        <h2>Composición de tus activos</h2>
        <Bars rows={kinds.filter((k) => nw.byKind[k] > 0).map((k) => ({ label: KIND_LABEL[k], value: nw.byKind[k] }))} />
      </div>
      {kinds.map((k) => {
        const accs = data.accounts.filter((a) => a.kind === k);
        if (!accs.length) return null;
        return (
          <div key={k}>
            <div className="section-title row between"><span>{KIND_LABEL[k]}</span><Money cents={nw.byKind[k]} /></div>
            <div className="card glass flush">
              <ul className="list">
                {accs.map((a) => (
                  <li key={a.id} className="tap" onClick={() => setEdit(a)}>
                    <span className="icon">{CURRENCIES.find((c) => c.code === a.currency)?.flag ?? '💱'}</span>
                    <div className="grow">
                      <div className="ellipsis">{a.name}</div>
                      <div className="small muted">
                        {a.source === 'manual' ? 'Manual' : a.source === 'import' ? 'Importada' : `Sincronizada${a.lastSync ? ` · ${a.lastSync}` : ''}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Money cents={a.balance} currency={a.currency} />
                      {a.currency !== base && <div className="tiny muted">≈ {formatMoney(toBase(data, a.balance, a.currency, date), base)}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
      <button className="btn block glass mt" onClick={() => setEdit({ kind: 'checking', currency: base, source: 'manual' })}><Icon name="plus" size={18} /> Añadir cuenta, inversión o deuda</button>

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
  const [currency, setCurrency] = useState(value.currency ?? 'EUR');
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
      <Field label="Nombre"><input value={name} placeholder="BBVA, Banesco, Wise USD, Binance, Hipoteca…" onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid2">
        <Field label={debt ? 'Deuda pendiente' : 'Saldo / valor actual'}><input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} /></Field>
        <Field label="Moneda">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={Boolean(value.id && value.source !== 'manual')}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
          </select>
        </Field>
      </div>
      {value.source && value.source !== 'manual' && value.source !== 'import' && <p className="small muted">El saldo de esta cuenta lo actualiza el banco al sincronizar.</p>}
      <button
        className="btn primary block mt"
        disabled={!name}
        onClick={() => onSave({ id: value.id ?? uid(), name, kind, balance: debt ? -Math.abs(cents) : cents, currency, source: value.source ?? 'manual', externalId: value.externalId, lastSync: value.source === 'manual' ? today() : value.lastSync })}
      >
        Guardar
      </button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar cuenta</button>}
    </>
  );
}
