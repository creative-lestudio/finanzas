import { useRef, useState } from 'react';
import { CURRENCIES } from '../lib/fx';
import { parseAmount, today, uid } from '../lib/money';
import type { Account, AccountKind } from '../lib/types';
import { AccountLogo, fileToLogo, KIND_LABEL } from './AccountLogo';
import { IconPicker } from './CategorySheet';
import { Field, toast } from './ui';
import { t as _t } from '../lib/i18n';

/** Crear o editar una cuenta: tipo, nombre, saldo, moneda y logo (imagen del banco o un icono). */
export function AccountForm({ value, onSave, onDelete }: { value: Partial<Account>; onSave: (a: Account) => void; onDelete?: () => void }) {
  const [name, setName] = useState(value.name ?? '');
  const [kind, setKind] = useState<AccountKind>(value.kind ?? 'checking');
  const [currency, setCurrency] = useState(value.currency ?? 'EUR');
  const isDebtKind = (k: AccountKind) => k === 'loan' || k === 'card';
  // Cuentas normales: el saldo conserva su signo (puede ser negativo: descubierto, efectivo prestado…).
  // Tarjetas y préstamos: se escribe lo que se debe, en positivo.
  const [balance, setBalance] = useState(value.balance !== undefined ? String((isDebtKind(value.kind ?? 'checking') ? Math.abs(value.balance) : value.balance) / 100).replace('.', ',') : '');
  const [image, setImage] = useState<string | undefined>(value.image);
  const [icon, setIcon] = useState<string | undefined>(value.icon);
  const [picking, setPicking] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const debt = kind === 'loan' || kind === 'card';
  const cents = parseAmount(balance) ?? 0;
  const overdrawn = !debt && cents < 0;

  const upload = async (f?: File) => {
    if (!f) return;
    try {
      setImage(await fileToLogo(f));
      setIcon(undefined);
    } catch {
      toast(_t("No se pudo leer esa imagen. Prueba con un PNG o JPG."));
    }
  };

  return (
    <>
      <div className="row" style={{ gap: 14, marginBottom: 14 }}>
        <AccountLogo account={{ image, icon, kind }} size={64} />
        <div className="grow">
          <div className="small muted" style={{ marginBottom: 6 }}>{_t("Logo de la cuenta")}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button type="button" className="btn tinted sm" onClick={() => file.current?.click()}>{_t("Subir imagen")}</button>
            <button type="button" className="btn sm" onClick={() => setPicking(!picking)}>{_t("Elegir icono")}</button>
            {(image || icon) && <button type="button" className="btn ghost sm" onClick={() => { setImage(undefined); setIcon(undefined); }}>{_t("Quitar")}</button>}
          </div>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      </div>
      {picking && <div className="mb"><IconPicker value={icon ?? ''} onChange={(v) => { setIcon(v || undefined); setImage(undefined); }} /></div>}
      <Field label={_t("Tipo")}>
        <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
          {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
      </Field>
      <Field label={_t("Nombre")}><input value={name} placeholder={_t("BBVA, Banesco, Wise USD, Binance, Hipoteca…")} onChange={(e) => setName(e.target.value)} aria-label={_t("Nombre de la cuenta")} /></Field>
      <div className="grid2">
        <Field label={debt ? _t("Deuda pendiente") : _t("Saldo / valor actual")}><input inputMode="decimal" value={balance} placeholder={debt ? '0' : _t("0 (admite negativo: -150)")} onChange={(e) => setBalance(e.target.value)} aria-label={_t("Saldo")} /></Field>
        <Field label={_t("Moneda")}>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={Boolean(value.id && value.source !== 'manual')}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
          </select>
        </Field>
      </div>
      {overdrawn && <p className="small muted" style={{ marginTop: 0 }}>{_t("Saldo negativo: la cuenta está en descubierto. Cuenta como deuda en tu patrimonio.")}</p>}
      {value.source && value.source !== 'manual' && value.source !== 'import' && <p className="small muted">{_t("El saldo de esta cuenta lo actualiza el banco al sincronizar.")}</p>}
      <button
        className="btn primary block mt"
        disabled={!name}
        onClick={() => onSave({ id: value.id ?? uid(), name, kind, balance: debt ? -Math.abs(cents) : cents, currency, source: value.source ?? 'manual', externalId: value.externalId, lastSync: value.source === 'manual' || !value.source ? today() : value.lastSync, image, icon })}
      >
        {_t("Guardar")}
      </button>
      {onDelete && <button className="btn danger block mt" onClick={onDelete}>{_t("Eliminar cuenta")}</button>}
    </>
  );
}
