import { useRef, useState } from 'react';
import { CURRENCIES } from '../lib/fx';
import { parseAmount, today, uid } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { AccountLogo, fileToLogo, KIND_LABEL } from './AccountLogo';
import { IconPicker } from './CategorySheet';
import { Field, toast } from './ui';

/** Crear o editar una cuenta: tipo, nombre, saldo, moneda y logo (imagen del banco o un icono). */
export function AccountForm({ value, onSave, onDelete }: { value: Partial<Account>; onSave: (a: Account) => void; onDelete?: () => void }) {
  const [name, setName] = useState(value.name ?? '');
  const [kind, setKind] = useState<AccountKind>(value.kind ?? 'checking');
  const [currency, setCurrency] = useState(value.currency ?? 'EUR');
  const [balance, setBalance] = useState(value.balance !== undefined ? String(Math.abs(value.balance) / 100).replace('.', ',') : '');
  const [image, setImage] = useState<string | undefined>(value.image);
  const [icon, setIcon] = useState<string | undefined>(value.icon);
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const debt = kind === 'loan' || kind === 'card';
  const cents = parseAmount(balance) ?? 0;

  const upload = async (f?: File) => {
    if (!f) return;
    try {
      setImage(await fileToLogo(f));
      setIcon(undefined);
    } catch {
      toast('No se pudo leer esa imagen. Prueba con un PNG o JPG.');
    }
  };

  return (
    <>
      <div className="row" style={{ gap: 14, marginBottom: 14 }}>
        <AccountLogo account={{ image, icon, kind }} size={64} />
        <div className="grow">
          <div className="small muted" style={{ marginBottom: 6 }}>Logo de la cuenta</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn tinted sm" onClick={() => file.current?.click()}>Subir imagen</button>
            <button type="button" className="btn sm" onClick={() => setPicking(!picking)}>Elegir icono</button>
            {(image || icon) && <button type="button" className="btn ghost sm" onClick={() => { setImage(undefined); setIcon(undefined); }}>Quitar</button>}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      </div>
      {picking && <div className="mb"><IconPicker value={icon ?? ''} onChange={(v) => { setIcon(v || undefined); setImage(undefined); }} /></div>}
      <Field label="Tipo">
        <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label="Nombre"><input value={name} placeholder="BBVA, Banesco, Wise USD, Binance, Hipoteca…" onChange={(e) => setName(e.target.value)} aria-label="Nombre de la cuenta" /></Field>
      <div className="grid2">
        <Field label={debt ? 'Deuda pendiente' : 'Saldo / valor actual'}><input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} aria-label="Saldo" /></Field>
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
        onClick={() => onSave({ id: value.id ?? uid(), name, kind, balance: debt ? -Math.abs(cents) : cents, currency, source: value.source ?? 'manual', externalId: value.externalId, lastSync: value.source === 'manual' || !value.source ? today() : value.lastSync, image, icon })}
      >
        Guardar
      </button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>Eliminar cuenta</button>}
    </>
  );
}
