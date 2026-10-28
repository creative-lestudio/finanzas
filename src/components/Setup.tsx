import { useState } from 'react';
import { CURRENCIES } from '../lib/fx';
import { uid } from '../lib/money';
import type { Account } from '../lib/types';
import { useStore } from '../store';
import { COACH } from './Coach';
import { Field } from './ui';

const TEMPLATES: { id: string; name: string; hint: string; kind: Account['kind']; currency: string }[] = [
  { id: 'bank-eur', name: 'Banco en euros', hint: 'BBVA, Santander, ING…', kind: 'checking', currency: 'EUR' },
  { id: 'bank-ves', name: 'Banco en bolívares', hint: 'Banesco, Mercantil…', kind: 'checking', currency: 'VES' },
  { id: 'usd', name: 'Dólares', hint: 'Zelle, Wise, Zinli…', kind: 'checking', currency: 'USD' },
  { id: 'usdt', name: 'USDT', hint: 'Binance', kind: 'crypto', currency: 'USDT' },
  { id: 'savings', name: 'Ahorro', hint: 'Cuenta remunerada', kind: 'savings', currency: 'EUR' },
  { id: 'card', name: 'Tarjeta de crédito', hint: 'Lo que debes', kind: 'card', currency: 'EUR' },
];

/**
 * Primer uso: el asistente pregunta la moneda principal y qué cuentas tienes,
 * para que la app no empiece vacía.
 */
export function Setup() {
  const { data, update } = useStore();
  const [currency, setCurrency] = useState(data.settings.currency);
  const [picked, setPicked] = useState<string[]>(['bank-eur']);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const finish = () =>
    update((d) => ({
      ...d,
      settings: { ...d.settings, currency, onboarded: true },
      accounts: [
        ...d.accounts,
        ...TEMPLATES.filter((t) => picked.includes(t.id)).map((t) => ({
          id: uid(),
          name: t.name,
          kind: t.kind,
          currency: t.id === 'bank-eur' || t.id === 'savings' || t.id === 'card' ? (currency === 'VES' ? 'USD' : currency) : t.currency,
          balance: 0,
          source: 'manual' as const,
        })),
      ],
    }));

  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="coach-hero" style={{ borderRadius: 0 }}>
        <img src={COACH.hola} alt="" />
        <div className="bubble"><b>¡Empecemos!</b>Dime qué moneda usas y dónde tienes tu dinero. Tardas un minuto.</div>
      </div>
      <div style={{ padding: '16px 18px 18px' }}>
        <Field label="Moneda principal (para tus totales)">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.filter((c) => !c.custom).map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code} · {c.name}</option>)}
          </select>
        </Field>
        <label style={{ margin: '0 4px' }}>¿Dónde tienes tu dinero? Elige todas las que uses</label>
        <div className="setup-tpl">
          {TEMPLATES.map((t) => (
            <button key={t.id} className={picked.includes(t.id) ? 'on' : ''} onClick={() => toggle(t.id)} aria-pressed={picked.includes(t.id)}>
              {t.name}
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
        <button className="btn primary block" onClick={finish}>Crear mis cuentas</button>
        <button className="btn ghost block mt small muted" onClick={() => update((d) => ({ ...d, settings: { ...d.settings, onboarded: true } }))}>Ahora no</button>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Luego pon el saldo de cada una en Más → Patrimonio. Siempre puedes añadir más.</p>
      </div>
    </div>
  );
}
