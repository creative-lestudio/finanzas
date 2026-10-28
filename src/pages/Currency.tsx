import { useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { Empty, Field, Money, Segmented, Sheet, toast } from '../components/ui';
import {
  accountCurrency,
  addRate,
  analyzeExchange,
  CURRENCIES,
  deleteExchange,
  displayPair,
  fxSummary,
  PLATFORMS,
  rateFor,
  RATE_SOURCES,
  RATE_TYPES,
  recordExchange,
  referenceTypesFor,
  simulateChain,
  type ChainStep,
  type RateType,
} from '../lib/fx';
import { addMonths, formatMoney, formatRate, parseAmount, today } from '../lib/money';
import type { AppData } from '../lib/types';
import { useStore } from '../store';

type Tab = 'summary' | 'rates' | 'calc';

/**
 * Lee una tasa: "236,5", "1.234,56" o "1.085" (con un solo punto, el punto es
 * decimal). En tasas en bolívares (`bs`), "1.100" se lee como mil cien.
 */
const num = (s: string, bs = false) => {
  const t = s.replace(/\s/g, '');
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  if ((t.match(/\./g) ?? []).length > 1 || (bs && /^\d{1,3}(\.\d{3})+$/.test(t))) return Number(t.replace(/\./g, ''));
  return Number(t);
};

/** Última tasa guardada de un tipo, expresada como "1 base = x quote". */
function lastRate(data: AppData, type: RateType, base?: string, quote?: string): number | null {
  const t = RATE_TYPES[type];
  const b = base ?? t.base;
  const q = quote ?? t.quote;
  if (!b || !q) return null;
  return rateFor(data, b, q, today(), type);
}

/** Divisas: tasas del día, cambios registrados y cuánto pierdes (o ganas) por tipo de cambio. */
export function Currency() {
  const [tab, setTab] = useState<Tab>('summary');
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Segmented value={tab} onChange={setTab} options={[['summary', 'Resumen'], ['rates', 'Tasas del día'], ['calc', 'Calculadora']]} />
      {tab === 'summary' && <Summary onAdd={() => setAdding(true)} />}
      {tab === 'rates' && <Rates />}
      {tab === 'calc' && <Calculator />}
      {adding && <ExchangeForm onClose={() => setAdding(false)} />}
    </>
  );
}

function Summary({ onAdd }: { onAdd: () => void }) {
  const { data, update } = useStore();
  const [range, setRange] = useState<'3' | '12' | 'all'>('3');
  const month = today().slice(0, 7);
  const fx = useMemo(() => fxSummary(data, range === 'all' ? undefined : addMonths(month, -Number(range) + 1)), [data, range, month]);
  const acc = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? '—';
  const bcv = lastRate(data, 'BCV');
  const par = lastRate(data, 'Paralelo');

  return (
    <>
      <div className="hero">
        <div className="eyebrow">{fx.total <= 0 ? 'Pérdida por tipo de cambio' : 'Ganancia por tipo de cambio'}</div>
        <div className={`big ${fx.total < 0 ? 'negc' : 'pos'}`}>{formatMoney(Math.abs(fx.total))}</div>
        <div className="hero-sub">
          <span>Comisiones <b>{formatMoney(fx.fees)}</b></span>
          <span><b>{fx.exchanges.length}</b> cambios</span>
          <span><b>{fx.incomes.length}</b> cobros en otra moneda</span>
        </div>
        <div className="chips mt">
          {(['3', '12', 'all'] as const).map((r) => (
            <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r === 'all' ? 'Todo' : `${r} meses`}</button>
          ))}
        </div>
      </div>

      {bcv && par && (
        <div className="grid2 mb">
          <div className="card glass">
            <div className="eyebrow">BCV · Paralelo</div>
            <div className="mid" style={{ fontSize: 19 }}>{formatRate(bcv)} · {formatRate(par)}</div>
            <div className="tiny muted">Bs por dólar, últimas guardadas</div>
          </div>
          <div className="card glass">
            <div className="eyebrow">Brecha cambiaria</div>
            <div className="mid" style={{ fontSize: 19 }}>{(((par - bcv) / bcv) * 100).toFixed(1)} %</div>
            <div className="tiny muted">Lo que pierdes si te pagan a BCV</div>
          </div>
        </div>
      )}

      <button className="btn primary block mb" onClick={onAdd}><Icon name="swap" size={18} /> Registrar un cambio</button>

      {fx.incomes.length > 0 && (
        <>
          <div className="section-title">Cobros a tasa oficial</div>
          <div className="card glass flush">
            <ul className="list">
              {fx.incomes.map((i) => (
                <li key={i.transaction.id}>
                  <span className="icon"><Icon name="arrowDown" size={18} /></span>
                  <div className="grow">
                    <div className="ellipsis">{formatMoney(i.nominal, i.nominalCurrency)} cobrados en {i.receivedCurrency}</div>
                    <div className="small muted ellipsis">
                      {i.transaction.date} · a {formatRate(i.paidRate)} ({i.transaction.fx?.source ?? '—'}){i.marketRate ? ` · mercado ${formatRate(i.marketRate)}` : ' · falta tasa de mercado'}
                    </div>
                  </div>
                  {i.diff !== null && (
                    <div style={{ textAlign: 'right' }}>
                      <div className={`num ${i.diff < 0 ? 'negc' : 'pos'}`}>{formatMoney(i.diff, i.nominalCurrency)}</div>
                      <div className="tiny muted">{((i.diffPct ?? 0) * 100).toFixed(1)} %</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {fx.byPlatform.length > 0 && (
        <>
          <div className="section-title">Plataformas, de mejor a peor</div>
          <div className="card glass">
            <table className="simple">
              <thead><tr><th>Plataforma</th><th className="r">Cambios</th><th className="r">Media</th><th className="r">Total</th></tr></thead>
              <tbody>
                {[...fx.byPlatform].reverse().map((p) => (
                  <tr key={p.platform}>
                    <td>{p.platform}</td>
                    <td className="r">{p.count}</td>
                    <td className={`r ${p.avgPct < 0 ? 'negc' : 'pos'}`}>{(p.avgPct * 100).toFixed(2)} %</td>
                    <td className="r"><Money cents={p.diffBase} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-title">Cambios registrados</div>
      <div className="card glass flush">
        {fx.exchanges.length === 0 && <Empty>Aún no has registrado cambios de divisa.</Empty>}
        <ul className="list">
          {fx.exchanges.map((a) => {
            const [s, w] = displayPair(a.from, a.to);
            const shown = (r: number) => (a.from === s ? r : 1 / r);
            return (
              <li key={a.exchange.id}>
                <span className="icon"><Icon name="swap" size={18} /></span>
                <div className="grow">
                  <div className="ellipsis">{formatMoney(a.exchange.fromAmount, a.from)} a {formatMoney(a.exchange.toAmount, a.to)}</div>
                  <div className="small muted ellipsis">{a.exchange.date} · {a.exchange.platform} · {acc(a.exchange.fromAccountId)} a {acc(a.exchange.toAccountId)}</div>
                  <div className="tiny muted">
                    1 {s} = {formatRate(shown(a.effectiveRate))} {w}
                    {a.referenceRate ? ` · ${a.exchange.referenceSource ?? 'ref.'} ${formatRate(shown(a.referenceRate))}` : ''}
                    {a.exchange.fee ? ` · comisión ${formatMoney(a.exchange.fee, a.from)}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {a.diff !== null && <div className={`num ${a.diff < 0 ? 'negc' : 'pos'}`}>{formatMoney(a.diff, a.to)}</div>}
                  {a.diffPct !== null && <div className="tiny muted">{(a.diffPct * 100).toFixed(2)} %</div>}
                  <button className="btn ghost sm" aria-label="Eliminar cambio" onClick={() => update((d) => deleteExchange(d, a.exchange.id))}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

/**
 * Registrar un cambio: tú escribes la tasa a la que cambiaste y la tasa con
 * la que quieres compararla (BCV, Euro, Paralelo o una personalizada).
 */
function ExchangeForm({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const accounts = data.accounts.filter((a) => a.kind !== 'loan');
  const [fromId, setFromId] = useState(accounts.find((a) => a.currency === 'VES')?.id ?? accounts[0]?.id);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== fromId && a.currency !== accountCurrency(data, fromId!))?.id ?? accounts[1]?.id);
  const from = accountCurrency(data, fromId!);
  const to = accountCurrency(data, toId!);
  const [strong, weak] = displayPair(from, to);
  const refTypes = referenceTypesFor(from, to);

  const [sent, setSent] = useState('');
  const [rate, setRate] = useState('');
  const [fee, setFee] = useState('');
  const [received, setReceived] = useState('');
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [platform, setPlatform] = useState(from === 'VES' || to === 'VES' ? 'Binance P2P' : 'Wise');
  const [date, setDate] = useState(today());
  const [refType, setRefType] = useState<RateType>(refTypes[0]);
  const activeRef = refTypes.includes(refType) ? refType : refTypes[0];
  const stored = activeRef === 'Personalizada' ? rateFor(data, strong, weak, date, 'Personalizada') : lastRate(data, activeRef);
  const [refValue, setRefValue] = useState('');
  const refShown = refValue ? num(refValue, weak === 'VES') : stored;

  // Tasa escrita como "1 fuerte = r débil" → tasa interna origen→destino.
  const toInternal = (r: number) => (from === strong ? r : 1 / r);
  const sentC = parseAmount(sent) ?? 0;
  const feeC = Math.abs(parseAmount(fee) ?? 0);
  const r = num(rate, weak === 'VES');
  const autoReceived = sentC && r > 0 ? Math.round((Math.abs(sentC) - feeC) * toInternal(r)) : 0;
  const gotC = receivedTouched ? Math.abs(parseAmount(received) ?? 0) : autoReceived;
  const refInternal = refShown && refShown > 0 ? toInternal(refShown) : undefined;

  const preview =
    sentC && gotC
      ? analyzeExchange({ ...data, exchanges: [] } as AppData, { id: 'x', date, fromAccountId: fromId!, toAccountId: toId!, fromAmount: Math.abs(sentC), toAmount: gotC, fee: feeC, platform, referenceRate: refInternal, referenceSource: activeRef })
      : null;

  const save = () => {
    if (!preview || fromId === toId) return;
    update((d) => {
      let next = recordExchange(d, { date, fromAccountId: fromId!, toAccountId: toId!, fromAmount: Math.abs(sentC), toAmount: gotC, fee: feeC, platform, referenceRate: refInternal, referenceSource: refInternal ? activeRef : undefined });
      // La tasa de referencia que escribiste queda guardada como la del día.
      if (refValue && refShown) {
        const t = RATE_TYPES[activeRef];
        next = addRate(next, { date, base: t.base ?? strong, quote: t.quote ?? weak, rate: refShown, source: activeRef });
      }
      return next;
    });
    toast(preview.diff !== null && preview.diff < 0 ? `Cambio guardado. Pierdes ${formatMoney(-preview.diff, to)} frente a ${activeRef}.` : 'Cambio guardado');
    onClose();
  };

  return (
    <Sheet title="Registrar cambio" onClose={onClose}>
      <Field label="Plataforma">
        <div className="chips">{PLATFORMS.map((p) => <button type="button" key={p} className={`chip ${platform === p ? 'on' : ''}`} onClick={() => setPlatform(p)}>{p}</button>)}</div>
      </Field>
      <div className="grid2">
        <Field label="Desde"><select value={fromId} onChange={(e) => setFromId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></Field>
        <Field label="Hacia"><select value={toId} onChange={(e) => setToId(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></Field>
      </div>
      <div className="grid2">
        <Field label={`Envías (${from})`}><input inputMode="decimal" value={sent} onChange={(e) => setSent(e.target.value)} placeholder="0,00" /></Field>
        <Field label={`Comisión (${from})`}><input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0,00" /></Field>
      </div>
      <div className="card glass" style={{ padding: '6px 16px', marginBottom: 0 }}>
        <div className="rate-input">
          <span className="small">Tasa del cambio</span>
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0,00" aria-label="Tasa del cambio" />
          <span className="unit">{weak} por {strong}</span>
        </div>
        <div className="rate-input">
          <span className="small">Recibes</span>
          <input
            inputMode="decimal"
            value={receivedTouched ? received : autoReceived ? (autoReceived / 100).toFixed(2).replace('.', ',') : ''}
            onChange={(e) => { setReceivedTouched(true); setReceived(e.target.value); }}
            placeholder="0,00"
            aria-label="Importe recibido"
          />
          <span className="unit">{to}</span>
        </div>
      </div>
      <p className="tiny muted" style={{ margin: '8px 4px 16px' }}>Escribe la tasa y calculamos lo que recibes, o escribe lo que te llegó si no sabes la tasa.</p>

      <Field label="Comparar con">
        <div className="chips">{refTypes.map((t) => <button type="button" key={t} className={`chip ${activeRef === t ? 'on' : ''}`} onClick={() => { setRefType(t); setRefValue(''); }}>{t}</button>)}</div>
      </Field>
      <div className="card glass" style={{ padding: '6px 16px', marginBottom: 0 }}>
        <div className="rate-input">
          <span className="small">{activeRef}</span>
          <input inputMode="decimal" value={refValue} onChange={(e) => setRefValue(e.target.value)} placeholder={stored ? formatRate(stored) : '0,00'} aria-label={`Tasa ${activeRef}`} />
          <span className="unit">{weak} por {strong}</span>
        </div>
      </div>
      <p className="tiny muted" style={{ margin: '8px 4px 16px' }}>{stored ? `Última guardada: ${formatRate(stored)}. Escribe la de hoy si cambió.` : 'Escribe la tasa de hoy: se guardará para los próximos cálculos.'}</p>
      <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>

      {preview && (
        <div className={`alert ${preview.diff !== null && preview.diff < 0 ? 'warning' : 'good'}`}>
          <Icon name={preview.diff !== null && preview.diff < 0 ? 'alert' : 'check'} size={18} />
          <div className="small">
            {preview.expected !== null ? (
              <>A tasa {activeRef} habrías recibido <b>{formatMoney(preview.expected, to)}</b>. {preview.diff! < 0 ? 'Pierdes' : 'Ganas'} <b>{formatMoney(Math.abs(preview.diff!), to)}</b> ({((preview.diffPct ?? 0) * 100).toFixed(2)} %).</>
            ) : (
              <>Añade la tasa {activeRef} para saber cuánto pierdes.</>
            )}
          </div>
        </div>
      )}
      <button className="btn primary block mt" disabled={!preview || fromId === toId} onClick={save}>Guardar cambio</button>
    </Sheet>
  );
}

/** Tasas del día: las escribes tú. BCV, Euro, Paralelo y una personalizada. */
function Rates() {
  const { data, update } = useStore();
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<RateType, string>>({ BCV: '', Euro: '', Paralelo: '', Personalizada: '' });
  const [cBase, setCBase] = useState('EUR');
  const [cQuote, setCQuote] = useState('USD');
  const set = (t: RateType, v: string) => setVals((x) => ({ ...x, [t]: v }));

  const history = useMemo(() => {
    const byDate = new Map<string, Record<string, (typeof data.rates)[number]>>();
    for (const r of data.rates) {
      const e = byDate.get(r.date) ?? {};
      e[r.source === 'Personalizada' ? `P:${r.base}/${r.quote}` : r.source] = r;
      byDate.set(r.date, e);
    }
    return [...byDate].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
  }, [data.rates]);

  const prev = (t: RateType) => (t === 'Personalizada' ? rateFor(data, cBase, cQuote, date, 'Personalizada') : lastRate(data, t));
  const isBs = (t: RateType) => t !== 'Personalizada' || cQuote === 'VES';
  const filled = RATE_SOURCES.filter((t) => num(vals[t], isBs(t)) > 0);
  const bcv = num(vals.BCV, true) || lastRate(data, 'BCV') || 0;
  const par = num(vals.Paralelo, true) || lastRate(data, 'Paralelo') || 0;
  const mini = { padding: '4px 22px 4px 8px', fontSize: 12, width: 'auto', backgroundPosition: 'calc(100% - 11px) 55%, calc(100% - 7px) 55%' };

  const save = () => {
    update((d) => {
      let next = d;
      for (const t of filled) {
        const meta = RATE_TYPES[t];
        next = addRate(next, { date, base: meta.base ?? cBase, quote: meta.quote ?? cQuote, rate: num(vals[t], isBs(t)), source: t });
      }
      return next;
    });
    toast(`${filled.length} tasa(s) guardada(s) para el ${date}`);
    setVals({ BCV: '', Euro: '', Paralelo: '', Personalizada: '' });
  };

  return (
    <>
      <div className="card glass">
        <div className="card-head">
          <h2>Tasas de hoy</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto', padding: '7px 10px', fontSize: 14 }} aria-label="Fecha" />
        </div>
        {(['BCV', 'Euro', 'Paralelo'] as RateType[]).map((t) => (
          <div className="rate-input" key={t}>
            <div>
              <div style={{ fontWeight: 600 }}>{t}</div>
              <div className="tiny muted">{RATE_TYPES[t].hint}</div>
            </div>
            <input inputMode="decimal" value={vals[t]} onChange={(e) => set(t, e.target.value)} placeholder={prev(t) ? formatRate(prev(t)!) : '0,00'} aria-label={`Tasa ${t}`} />
            <span className="unit">Bs</span>
          </div>
        ))}
        <div className="rate-input">
          <div>
            <div style={{ fontWeight: 600 }}>Personalizada</div>
            <div className="row tiny muted" style={{ gap: 4, marginTop: 4 }}>
              1
              <select value={cBase} onChange={(e) => setCBase(e.target.value)} style={mini} aria-label="Moneda base">{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select>
              =
              <select value={cQuote} onChange={(e) => setCQuote(e.target.value)} style={mini} aria-label="Moneda cotizada">{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select>
            </div>
          </div>
          <input inputMode="decimal" value={vals.Personalizada} onChange={(e) => set('Personalizada', e.target.value)} placeholder={prev('Personalizada') ? formatRate(prev('Personalizada')!) : '0,00'} aria-label="Tasa personalizada" />
          <span className="unit">{cQuote}</span>
        </div>
        {bcv > 0 && par > 0 && (
          <p className="small secondary" style={{ margin: '10px 0 14px' }}>Brecha BCV–paralelo: <b>{(((par - bcv) / bcv) * 100).toFixed(1)} %</b></p>
        )}
        <button className="btn primary block" disabled={!filled.length || (num(vals.Personalizada, isBs('Personalizada')) > 0 && cBase === cQuote)} onClick={save}>Guardar tasas</button>
        <p className="tiny muted" style={{ marginBottom: 0 }}>Las tasas cambian cada día: escríbelas cuando cambies dinero o cobres. Los campos vacíos mantienen la última guardada.</p>
      </div>

      {data.accounts.some((a) => a.currency === 'VES') && (
        <div className="card glass">
          <h2>Para valorar tus bolívares usa</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Convierte saldos y movimientos en Bs a {data.settings.currency} y mide lo que pierdes al cobrar a tasa oficial.</p>
          <div className="seg" style={{ marginBottom: 0 }}>
            {(['Paralelo', 'BCV'] as RateType[]).map((t) => (
              <button key={t} className={(data.settings.rateSource?.VES ?? 'Paralelo') === t ? 'on' : ''} onClick={() => update((d) => ({ ...d, settings: { ...d.settings, rateSource: { ...d.settings.rateSource, VES: t } } }))}>{t}</button>
            ))}
          </div>
        </div>
      )}

      <div className="section-title">Historial</div>
      <div className="card glass flush">
        {history.length === 0 && <Empty>Sin tasas guardadas todavía.</Empty>}
        <ul className="list plain">
          {history.map(([d, rs]) => (
            <li key={d} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="small" style={{ fontWeight: 600 }}>{d}</div>
                <div className="small secondary" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
                  {Object.entries(rs).map(([k, r]) => (
                    <span key={k} className="num">{k.startsWith('P:') ? `1 ${r.base} = ${formatRate(r.rate)} ${r.quote}` : `${k} ${formatRate(r.rate)}`}</span>
                  ))}
                </div>
              </div>
              <button className="btn ghost sm" aria-label={`Borrar tasas del ${d}`} onClick={() => update((x) => ({ ...x, rates: x.rates.filter((r) => r.date !== d) }))}><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * Calculadora de la "ruta del dinero": 800 $ cobrados en Bs a tasa BCV →
 * comprar $ en el paralelo → (opcional) pasar a euros con Wise.
 */
function Calculator() {
  const { data } = useStore();
  const [nominal, setNominal] = useState('800');
  const [bcv, setBcv] = useState(() => String(lastRate(data, 'BCV') ?? ''));
  const [par, setPar] = useState(() => String(lastRate(data, 'Paralelo') ?? ''));
  const [p2pFee, setP2pFee] = useState('0');
  const [wise, setWise] = useState(true);
  const [wiseRate, setWiseRate] = useState('');
  const [wiseFee, setWiseFee] = useState('');
  const [mid, setMid] = useState(() => String(rateFor(data, 'EUR', 'USD', today(), 'Personalizada') ?? ''));

  const n = Math.round(num(nominal) * 100);
  const valid = n > 0 && num(bcv, true) > 0 && num(par, true) > 0;
  const steps: ChainStep[] = [
    { label: 'Te pagan en Bs a tasa BCV', to: 'VES', rate: num(bcv, true) },
    { label: 'Compras dólares en el paralelo', to: 'USD', rate: 1 / num(par, true), feePct: (num(p2pFee) || 0) / 100 },
  ];
  const wr = num(wiseRate) || num(mid);
  if (wise && wr > 0) steps.push({ label: 'Pasas a euros con Wise', to: 'EUR', rate: 1 / wr, feeFixed: Math.round((num(wiseFee) || 0) * 100) });
  const result = valid ? simulateChain({ amount: n, currency: 'USD' }, steps, { VES: num(par, true), EUR: 1 / (num(mid) || wr || 1) }) : [];
  const last = result[result.length - 1];

  return (
    <>
      <div className="card glass">
        <h2>Tu caso</h2>
        <div className="rate-input"><span className="small">Te deben</span><input inputMode="decimal" value={nominal} onChange={(e) => setNominal(e.target.value)} aria-label="Importe que te deben" /><span className="unit">USD</span></div>
        <div className="rate-input"><span className="small">Tasa BCV</span><input inputMode="decimal" value={bcv} onChange={(e) => setBcv(e.target.value)} placeholder="0,00" aria-label="Tasa BCV" /><span className="unit">Bs por $</span></div>
        <div className="rate-input"><span className="small">Tasa paralelo</span><input inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} placeholder="0,00" aria-label="Tasa paralelo" /><span className="unit">Bs por $</span></div>
        <div className="rate-input"><span className="small">Comisión P2P</span><input inputMode="decimal" value={p2pFee} onChange={(e) => setP2pFee(e.target.value)} aria-label="Comisión P2P" /><span className="unit">%</span></div>
        <label className="switch-row" style={{ color: 'var(--text)', fontSize: 15, margin: '6px 0 0' }}>
          <span className="grow">Pasar a euros con Wise</span>
          <input type="checkbox" className="switch" checked={wise} onChange={(e) => setWise(e.target.checked)} />
        </label>
        {wise && (
          <>
            <div className="rate-input"><span className="small">Tasa Wise</span><input inputMode="decimal" value={wiseRate} onChange={(e) => setWiseRate(e.target.value)} placeholder={mid || '0,00'} aria-label="Tasa Wise" /><span className="unit">$ por €</span></div>
            <div className="rate-input"><span className="small">Comisión Wise</span><input inputMode="decimal" value={wiseFee} onChange={(e) => setWiseFee(e.target.value)} placeholder="0,00" aria-label="Comisión Wise" /><span className="unit">$</span></div>
            <div className="rate-input"><span className="small">Tipo real</span><input inputMode="decimal" value={mid} onChange={(e) => setMid(e.target.value)} placeholder="0,00" aria-label="Tipo de cambio real" /><span className="unit">$ por €</span></div>
          </>
        )}
      </div>

      {valid && last && (
        <div className="card glass">
          <h2>La ruta de tu dinero</h2>
          {result.map((r, i) => (
            <div className="step" key={i}>
              <span className="n">{i}</span>
              <div>
                <div className="small secondary">{r.label}</div>
                <div className="mid" style={{ fontSize: 19 }}>{formatMoney(r.amount, r.currency)}</div>
                {r.currency !== 'USD' && Number.isFinite(r.value) && <div className="tiny muted">equivale a {formatMoney(r.value, 'USD')}</div>}
              </div>
              {i > 0 && Number.isFinite(r.stepDiff) && <span className={`num small ${r.stepDiff < 0 ? 'negc' : 'muted'}`}>{r.stepDiff < 0 ? '−' : ''}{formatMoney(Math.abs(r.stepDiff), 'USD')}</span>}
            </div>
          ))}
          {Number.isFinite(last.value) && (
            <div className={`alert ${last.totalDiff < 0 ? 'over' : 'good'} mt`}>
              <Icon name={last.totalDiff < 0 ? 'arrowDown' : 'check'} size={18} />
              <div>
                <div className="small">De {formatMoney(n, 'USD')} te llegan en valor real</div>
                <div className="mid">{formatMoney(last.value, 'USD')}</div>
                <div className="small">
                  Pierdes <b>{formatMoney(-last.totalDiff, 'USD')}</b> ({((-last.totalDiff / n) * 100).toFixed(1)} %). Solo por cobrar a BCV: <b>{formatMoney(-result[1].stepDiff, 'USD')}</b>.
                </div>
              </div>
            </div>
          )}
          <p className="tiny muted" style={{ marginBottom: 0 }}>Para cobrar {formatMoney(n, 'USD')} reales en bolívares necesitarías {formatMoney(Math.round(n * num(par, true)), 'VES')}.</p>
        </div>
      )}
    </>
  );
}
