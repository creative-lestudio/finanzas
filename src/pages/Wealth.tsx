import { useState } from 'react';
import { AccountForm } from '../components/AccountForm';
import { AccountLogo, KIND_LABEL } from '../components/AccountLogo';
import { Icon } from '../components/icons';
import { Bars, Money, Sheet } from '../components/ui';
import { accountBase } from '../lib/fx';
import { netWorth } from '../lib/health';
import { formatMoney, today } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { useStore } from '../store';

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
                    <AccountLogo account={a} size={40} />
                    <div className="grow">
                      <div className="ellipsis">{a.name}</div>
                      <div className="small muted">
                        {a.source === 'manual' ? 'Manual' : a.source === 'import' ? 'Importada' : `Sincronizada${a.lastSync ? ` · ${a.lastSync}` : ''}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Money cents={a.balance} currency={a.currency} />
                      {a.currency !== base && <div className="tiny muted">≈ {formatMoney(accountBase(data, a, date), base)}</div>}
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

