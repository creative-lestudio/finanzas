import { useEffect, useMemo, useState } from 'react';
import { CURRENCIES, rateFor, referenceTypesFor } from '../lib/fx';
import { formatMoney, formatRate, parseAmount } from '../lib/money';
import type { RateQuote, Transaction } from '../lib/types';
import { useStore } from '../store';

export interface EquivResult {
  fx: NonNullable<Transaction['fx']>;
  /** Tasa de mercado del día que conviene guardar para los próximos movimientos. */
  saveRate?: Omit<RateQuote, 'id'>;
}

const parseRate = (s: string): number => {
  const t = s.trim();
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const label = (s: string) => (s === 'Personalizada' ? 'Acordada' : s);

/**
 * Registra el equivalente de un movimiento en otra moneda (p. ej. cobro en Bs = 1.250 $ a tasa acordada).
 * Dos formas de rellenarlo: con la tasa (el monto sale solo) o con el monto en la otra moneda (sale la tasa).
 */
export function Equivalent({ currency, date, cents, initial, defaultOpen, onChange }: {
  currency: string;
  date: string;
  cents: number | null;
  initial?: Transaction['fx'];
  defaultOpen?: boolean;
  onChange: (r: EquivResult | null) => void;
}) {
  const { data } = useStore();
  const [open, setOpen] = useState(Boolean(initial) || Boolean(defaultOpen));
  const others = CURRENCIES.filter((c) => c.code !== currency);
  const [eq, setEq] = useState(initial?.currency ?? (currency === 'USD' ? 'EUR' : 'USD'));
  const sources = useMemo(() => referenceTypesFor(eq, currency), [eq, currency]);
  const [source, setSource] = useState<string>(initial?.source ?? sources[0]);
  const [mode, setMode] = useState<'rate' | 'amount'>('rate');
  const [rateStr, setRateStr] = useState(initial ? String(initial.rate).replace('.', ',') : '');
  const [eqStr, setEqStr] = useState('');
  const [dirty, setDirty] = useState(Boolean(initial));

  const activeSource = sources.includes(source as never) ? source : sources[0];
  const stored = activeSource === 'Personalizada' ? null : rateFor(data, eq, currency, date, activeSource);
  const sameDay = data.rates.some((r) => r.date === date && r.source === activeSource && ((r.base === eq && r.quote === currency) || (r.base === currency && r.quote === eq)));

  // Al cambiar fuente, moneda o fecha se propone la tasa guardada de esa fuente.
  useEffect(() => {
    if (dirty || mode !== 'rate') return;
    setRateStr(stored ? String(Math.round(stored * 10000) / 10000).replace('.', ',') : '');
  }, [stored, dirty, mode]);

  const abs = cents ? Math.abs(cents) : 0;
  const rate = mode === 'rate' ? parseRate(rateStr) : (() => { const e = Math.abs(parseAmount(eqStr) ?? 0); return e && abs ? abs / e : 0; })();
  const eqCents = mode === 'rate' ? (rate && abs ? Math.round(abs / rate) : 0) : Math.abs(parseAmount(eqStr) ?? 0);
  const valid = open && abs > 0 && rate > 0 && eqCents > 0;
  const market = rateFor(data, eq, currency, date);

  const result = useMemo<EquivResult | null>(() => {
    if (!valid) return null;
    const r = Math.round(rate * 10000) / 10000;
    const fx = { amount: eqCents, currency: eq, rate: r, source: activeSource };
    const changed = stored === null || Math.abs(stored - rate) > 1e-6;
    const saveRate = mode === 'rate' && activeSource !== 'Personalizada' && (changed || !sameDay) ? { date, base: eq, quote: currency, rate: r, source: activeSource } : undefined;
    return { fx, saveRate };
  }, [valid, rate, eqCents, eq, activeSource, stored, mode, sameDay, date, currency]);

  useEffect(() => onChange(result), [result]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) onChange(null); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const gain = valid && market && abs ? Math.round(abs / market) : null;

  return (
    <div className="card glass" style={{ padding: 14 }}>
      <label className="switch-row" style={{ margin: 0, color: 'var(--text)', fontSize: 15 }}>
        <span className="grow">Registrar su equivalente en otra moneda<div className="tiny muted">Ej.: pagado en Bs = 1.250 $ a tasa acordada</div></span>
        <input type="checkbox" className="switch" checked={open} onChange={(e) => setOpen(e.target.checked)} />
      </label>
      {open && (
        <>
          <div className="field mt">
            <label>Equivalente en
              <select value={eq} onChange={(e) => { setEq(e.target.value); setSource(referenceTypesFor(e.target.value, currency)[0]); setDirty(false); }}>
                {others.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
            </label>
          </div>
          <div className="seg" aria-label="Tasa usada">
            {sources.map((s) => <button key={s} type="button" className={activeSource === s ? 'on' : ''} onClick={() => { setSource(s); setDirty(false); }}>{label(s)}</button>)}
          </div>
          <div className="seg">
            <button type="button" className={mode === 'rate' ? 'on' : ''} onClick={() => setMode('rate')}>Tengo la tasa</button>
            <button type="button" className={mode === 'amount' ? 'on' : ''} onClick={() => setMode('amount')}>Tengo el monto en {eq}</button>
          </div>
          {mode === 'rate' ? (
            <div className="field">
              <input inputMode="decimal" placeholder={`Tasa ${label(activeSource)}: ${currency} por 1 ${eq}`} value={rateStr} onChange={(e) => { setRateStr(e.target.value); setDirty(true); }} aria-label="Tasa" />
            </div>
          ) : (
            <div className="field">
              <input inputMode="decimal" placeholder={`Monto en ${eq} (ej. 1250)`} value={eqStr} onChange={(e) => setEqStr(e.target.value)} aria-label={`Monto en ${eq}`} />
            </div>
          )}
          {mode === 'rate' && !rateStr && activeSource !== 'Personalizada' && (
            <p className="tiny muted" style={{ margin: 0 }}>No tengo la tasa {activeSource} de este día. Escríbela y se guardará para tus próximos movimientos.</p>
          )}
          {valid && (
            <p className="small" style={{ margin: '8px 0 0' }}>
              {formatMoney(abs, currency)} <span className="muted">≈</span> <b>{formatMoney(eqCents, eq)}</b> a <b>{formatRate(rate)}</b> {currency}/{eq} · {label(activeSource)}
              {result?.saveRate && <span className="tiny muted"> · se guardará como tasa {activeSource} del día</span>}
            </p>
          )}
          {valid && gain !== null && market && Math.abs(market - rate) / market > 0.005 && (
            <p className="tiny muted" style={{ margin: '4px 0 0' }}>
              A tasa de mercado ({formatRate(market)}) valdría {formatMoney(gain, eq)}: {gain > eqCents ? 'diferencia a favor del mercado' : 'por encima del mercado'} de {formatMoney(Math.abs(gain - eqCents), eq)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
