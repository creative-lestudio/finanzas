import { useState } from 'react';
import { CURRENCIES } from '../lib/fx';
import { t as _t } from '../lib/i18n';
import { uid } from '../lib/money';
import { defaultCurrency, detectCountry, detectRegion, REGION_LABEL, REGIONS, type Region } from '../lib/region';
import type { Account, Profile } from '../lib/types';
import { useStore } from '../store';
import { COACH } from './Coach';
import { ProfileQuestions, profileComplete } from './ProfileQuestions';
import { Field } from './ui';

interface Tpl {
  id: string;
  name: string;
  hint: string;
  kind: Account['kind'];
  /** 'MAIN' = tu moneda principal. */
  currency: string;
}

const T = (id: string, name: string, hint: string, kind: Account['kind'], currency = 'MAIN'): Tpl => ({ id, name, hint, kind, currency });

/** Cuentas típicas de cada región: así nadie empieza con una lista que no es la suya. */
export const TEMPLATES: Record<Region, Tpl[]> = {
  ES: [T('bank', 'Cuenta bancaria', 'BBVA, Santander, CaixaBank, ING…', 'checking'), T('cash', 'Efectivo', 'Lo que llevas encima', 'cash'), T('savings', 'Ahorro', 'Cuenta remunerada', 'savings'), T('card', 'Tarjeta de crédito', 'Lo que debes', 'card'), T('usd', 'Dólares', 'Wise, Revolut…', 'checking', 'USD'), T('invest', 'Inversión', 'Fondos, acciones, cripto', 'investment')],
  EU: [T('bank', 'Cuenta bancaria', 'Tu banco', 'checking'), T('cash', 'Efectivo', 'Lo que llevas encima', 'cash'), T('savings', 'Ahorro', 'Cuenta remunerada', 'savings'), T('card', 'Tarjeta de crédito', 'Lo que debes', 'card'), T('usd', 'Dólares', 'Wise, Revolut…', 'checking', 'USD'), T('invest', 'Inversión', 'Fondos, acciones, cripto', 'investment')],
  US: [T('bank', 'Checking', 'Chase, Bank of America, Wells Fargo…', 'checking'), T('savings', 'Savings', 'Cuenta de ahorro', 'savings'), T('card', 'Tarjeta de crédito', 'Lo que debes', 'card'), T('cash', 'Efectivo', 'Lo que llevas encima', 'cash'), T('apps', 'Apps de pago', 'Venmo, Zelle, Cash App, PayPal', 'checking'), T('retire', '401(k) / IRA', 'Retiro e inversión', 'investment')],
  VE: [T('bank-ves', 'Banco en bolívares', 'Banesco, Mercantil, Provincial…', 'checking', 'VES'), T('usd', 'Dólares', 'Zelle, Wise, Zinli, PayPal…', 'checking', 'USD'), T('cash-usd', 'Efectivo en dólares', 'Lo que llevas encima', 'cash', 'USD'), T('usdt', 'USDT', 'Binance', 'crypto', 'USDT'), T('savings', 'Ahorro', 'Cuenta remunerada', 'savings', 'USD'), T('card', 'Tarjeta de crédito', 'Lo que debes', 'card', 'USD')],
  LATAM: [T('bank', 'Cuenta bancaria', 'Tu banco', 'checking'), T('cash', 'Efectivo', 'Lo que llevas encima', 'cash'), T('usd', 'Dólares', 'Efectivo o cuenta en dólares', 'checking', 'USD'), T('savings', 'Ahorro', 'Cuenta remunerada', 'savings'), T('card', 'Tarjeta de crédito', 'Lo que debes', 'card'), T('wallet', 'Billetera digital', 'Mercado Pago, Nequi, Nubank…', 'checking')],
  OTHER: [T('bank', 'Cuenta bancaria', 'Tu banco', 'checking'), T('cash', 'Efectivo', 'Lo que llevas encima', 'cash'), T('savings', 'Ahorro', 'Cuenta remunerada', 'savings'), T('card', 'Tarjeta de crédito', 'Lo que debes', 'card'), T('usd', 'Dólares', 'Efectivo o cuenta en dólares', 'checking', 'USD'), T('invest', 'Inversión', 'Fondos, acciones, cripto', 'investment')],
};

/**
 * Primer uso: región, moneda principal, cuentas típicas de tu país y tres preguntas.
 * Todo se puede cambiar después; se tarda menos de un minuto.
 */
export function Setup() {
  const { data, update } = useStore();
  const [region, setRegion] = useState<Region>(data.settings.region ?? detectRegion());
  const [currency, setCurrency] = useState(data.settings.currency !== 'EUR' || region === 'ES' || region === 'EU' ? data.settings.currency : defaultCurrency());
  const [picked, setPicked] = useState<string[]>(() => TEMPLATES[region].slice(0, 2).map((t) => t.id));
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const chooseRegion = (r: Region) => {
    setRegion(r);
    setCurrency(r === 'ES' || r === 'EU' ? 'EUR' : r === detectRegion() ? defaultCurrency(detectCountry()) : r === 'US' || r === 'VE' || r === 'LATAM' ? 'USD' : defaultCurrency());
    setPicked(TEMPLATES[r].slice(0, 2).map((t) => t.id));
  };

  const finish = () =>
    update((d) => ({
      ...d,
      settings: { ...d.settings, currency, region, onboarded: true, ...(profileComplete(profile) ? { profile } : {}) },
      accounts: [
        ...d.accounts,
        ...TEMPLATES[region].filter((t) => picked.includes(t.id)).map((t) => ({
          id: uid(),
          name: _t(t.name),
          kind: t.kind,
          currency: t.currency === 'MAIN' ? currency : t.currency,
          balance: 0,
          source: 'manual' as const,
        })),
      ],
    }));

  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="coach-hero" style={{ borderRadius: 0 }}>
        <img src={COACH.hola} alt="" />
        <div className="bubble"><b>{_t("¡Empecemos!")}</b>{_t("Dime dónde vives, qué moneda usas y dónde tienes tu dinero. Tardas un minuto.")}</div>
      </div>
      <div style={{ padding: '16px 18px 18px' }}>
        <div className="grid2">
          <Field label={_t("¿Dónde vives?")}>
            <select value={region} onChange={(e) => chooseRegion(e.target.value as Region)} aria-label={_t("País o región")}>
              {REGIONS.map((r) => <option key={r} value={r}>{_t(REGION_LABEL[r])}</option>)}
            </select>
          </Field>
          <Field label={_t("Moneda principal")}>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label={_t("Moneda principal")}>
              {CURRENCIES.filter((c) => !c.custom).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code} · {_t(c.name)}</option>)}
            </select>
          </Field>
        </div>
        <label style={{ margin: '0 4px' }}>{_t("¿Dónde tienes tu dinero? Elige todas las que uses")}</label>
        <div className="setup-tpl">
          {TEMPLATES[region].map((t) => (
            <button key={t.id} className={picked.includes(t.id) ? 'on' : ''} onClick={() => toggle(t.id)} aria-pressed={picked.includes(t.id)}>
              {_t(t.name)}
              <span>{_t(t.hint)}</span>
            </button>
          ))}
        </div>
        <div style={{ borderTop: '0.5px solid var(--hairline)', paddingTop: 14, marginTop: 4 }}>
          <div className="small muted" style={{ margin: '0 4px 10px' }}>{_t("Tres toques para personalizar tus lecciones y consejos")}</div>
          <ProfileQuestions value={profile} onChange={setProfile} />
        </div>
        <button className="btn primary block" onClick={finish}>{_t("Crear mis cuentas")}</button>
        <button className="btn ghost block mt small muted" onClick={() => update((d) => ({ ...d, settings: { ...d.settings, region, currency, onboarded: true } }))}>{_t("Ahora no")}</button>
        <p className="tiny muted" style={{ marginBottom: 0 }}>{_t("Luego pon el saldo de cada una en Cuentas. Siempre puedes añadir más.")}</p>
      </div>
    </div>
  );
}
