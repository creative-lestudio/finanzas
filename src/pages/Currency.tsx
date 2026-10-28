import { useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { Empty, Field, Money, Segmented, Sheet, toast } from '../components/ui';
import { accountCurrency, addRate, analyzeExchange, CURRENCIES, currencyInfo, deleteExchange, fxSummary, PLATFORMS, rateFor, RATE_SOURCES, recordExchange, simulateChain, type ChainStep } from '../lib/fx';
import { addMonths, formatMoney, formatRate, parseAmount, today } from '../lib/money';
import { fetchRates } from '../lib/ratesFetch';
import type { AppData } from '../lib/types';
import { useStore } from '../store';

type Tab = 'summary' | 'calc' | 'rates';

/** Divisas: registra cambios, guarda tasas y mide cuánto pierdes (o ganas) por tipo de cambio. */
export function Currency() {
  const [tab, setTab] = useState<Tab>('summary');
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Segmented value={tab} onChange={setTab} options={[['summary', 'Resumen'], ['calc', 'Calculadora'], ['rates', 'Tasas']]} />
      {tab === 'summary' && <Summary onAdd={() => setAdding(true)} />}
      {tab === 'calc' && <Calculator />}
      {tab === 'rates' && <Rates />}
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

  return (
    <>
      <div className="hero glass">
        <div className="small secondary">{fx.total <= 0 ? 'Has perdido por tipo de cambio' : 'Has ganado por tipo de cambio'}</div>
        <div className={`big ${fx.total < 0 ? 'negc' : 'pos'}`} style={{ fontSize: 40 }}>{formatMoney(Math.abs(fx.total))}</div>
        <div className="small secondary">Comisiones explícitas: {formatMoney(fx.fees)} · {fx.exchanges.length} cambios · {fx.incomes.length} cobros en otra moneda</div>
        <div className="chips mt">
          {(['3', '12', 'all'] as const).map((r) => (
            <button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r === 'all' ? 'Todo' : `${r} meses`}</button>
          ))}
        </div>
      </div>

      <button className="btn primary block mb" onClick={onAdd}><Icon name="swap" size={18} /> Registrar un cambio</button>

      {fx.incomes.length > 0 && (
        <div className="card glass">
          <h2>Cobros a tasa oficial</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Lo que te debían frente a lo que vale de verdad lo que recibiste, a tasa de mercado.</p>
          <ul className="list">
            {fx.incomes.map((i) => (
              <li key={i.transaction.id}>
                <div className="grow">
                  <div>{formatMoney(i.nominal, i.nominalCurrency)} → {formatMoney(i.received, i.receivedCurrency)}</div>
                  <div className="small muted">
                    {i.transaction.date} · pagado a {formatRate(i.paidRate)} ({i.transaction.fx?.source ?? '—'}){i.marketRate ? ` · mercado ${formatRate(i.marketRate)}` : ' · sin tasa de mercado'}
                  </div>
                </div>
                {i.diff !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <div className={i.diff < 0 ? 'negc num' : 'pos num'}>{formatMoney(i.diff, i.nominalCurrency)}</div>
                    <div className="tiny muted">{((i.diffPct ?? 0) * 100).toFixed(1)} %</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fx.byPlatform.length > 0 && (
        <div className="card glass">
          <h2>Plataformas: de mejor a peor</h2>
          <table className="simple">
            <thead><tr><th>Plataforma</th><th className="r">Ops.</th><th className="r">Media</th><th className="r">Total</th></tr></thead>
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
      )}

      <div className="section-title">Cambios registrados</div>
      <div className="card glass flush">
        {fx.exchanges.length === 0 && <Empty>Aún no has registrado cambios de divisa.</Empty>}
        <ul className="list">
          {fx.exchanges.map((a) => (
            <li key={a.exchange.id}>
              <span className="icon">💱</span>
              <div className="grow">
                <div className="ellipsis">{formatMoney(a.exchange.fromAmount, a.from)} → {formatMoney(a.exchange.toAmount, a.to)}</div>
                <div className="small muted ellipsis">
                  {a.exchange.date} · {a.exchange.platform} · {acc(a.exchange.fromAccountId)} → {acc(a.exchange.toAccountId)}
                </div>
                <div className="tiny muted">
                  Tasa obtenida {formatRate(a.effectiveRate)}{a.referenceRate ? ` · referencia ${formatRate(a.referenceRate)} (${a.referenceSource ?? '—'})` : ''}
                  {a.exchange.fee ? ` · comisión ${formatMoney(a.exchange.fee, a.from)}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {a.diff !== null && <div className={`num ${a.diff < 0 ? 'negc' : 'pos'}`}>{formatMoney(a.diff, a.to)}</div>}
                {a.diffPct !== null && <div className="tiny muted">{(a.diffPct * 100).toFixed(2)} %</div>}
                <button className="btn ghost sm" aria-label="Eliminar cambio" onClick={() => confirm('¿Eliminar este cambio y sus movimientos?') && update((d) => deleteExchange(d, a.exchange.id))}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function ExchangeForm({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const accounts = data.accounts.filter((a) => a.kind !== 'loan');
  const [fromId, setFromId] = useState(accounts.find((a) => a.currency === 'VES')?.id ?? accounts[0]?.id);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== fromId && a.currency !== accountCurrency(data, fromId!))?.id ?? accounts[1]?.id);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fee, setFee] = useState('');
  const [platform, setPlatform] = useState('Wise');
  const [date, setDate] = useState(today());
  const [refSource, setRefSource] = useState('');
  const [refManual, setRefManual] = useState('');

  const from = accountCurrency(data, fromId!);
  const to = accountCurrency(data, toId!);
  const sent = parseAmount(fromAmount) ?? 0;
  const got = parseAmount(toAmount) ?? 0;
  const feeC = parseAmount(fee) ?? 0;
  const storedRef = rateFor(data, from, to, date, refSource || undefined);
  const manual = Number(refManual.replace(',', '.'));
  // La referencia se escribe como la gente la piensa: "Bs por dólar" → se invierte si hace falta.
  const eff = sent ? Math.abs(got / sent) : 0;
  const refRate = manual > 0 ? (eff && Math.abs(Math.log(manual / eff)) > Math.abs(Math.log(1 / manual / eff)) ? 1 / manual : manual) : storedRef;
  const preview = sent && got ? analyzeExchange({ ...data, exchanges: [] } as AppData, { id: 'x', date, fromAccountId: fromId!, toAccountId: toId!, fromAmount: Math.abs(sent), toAmount: Math.abs(got), fee: Math.abs(feeC), platform, referenceRate: refRate ?? undefined, referenceSource: manual > 0 ? 'Manual' : refSource || 'tasa guardada' }) : null;

  const save = () => {
    if (!preview || fromId === toId) return;
    update((d) => recordExchange(d, { date, fromAccountId: fromId!, toAccountId: toId!, fromAmount: Math.abs(sent), toAmount: Math.abs(got), fee: Math.abs(feeC), platform, referenceRate: refRate ?? undefined, referenceSource: manual > 0 ? 'Manual' : refSource || undefined }));
    toast(preview.diff !== null && preview.diff < 0 ? `Cambio guardado. Perdiste ${formatMoney(-preview.diff, to)} frente a la referencia.` : 'Cambio guardado');
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
        <Field label={`Sale (total, ${from})`}><input inputMode="decimal" value={fromAmount} onChange={(e) => setFromAmount(e.target.value)} placeholder="0,00" /></Field>
        <Field label={`Llega (${to})`}><input inputMode="decimal" value={toAmount} onChange={(e) => setToAmount(e.target.value)} placeholder="0,00" /></Field>
      </div>
      <div className="grid2">
        <Field label={`Comisión incluida (${from})`}><input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0,00" /></Field>
        <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="grid2">
        <Field label="Comparar con">
          <select value={refSource} onChange={(e) => setRefSource(e.target.value)}>
            <option value="">Tasa preferida</option>
            {RATE_SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="o tasa manual"><input inputMode="decimal" value={refManual} onChange={(e) => setRefManual(e.target.value)} placeholder={storedRef ? formatRate(storedRef) : 'p. ej. 1,085'} /></Field>
      </div>
      {preview && (
        <div className={`alert ${preview.diff !== null && preview.diff < 0 ? 'warning' : 'good'}`}>
          <div className="small">
            Tasa obtenida: <b>{formatRate(preview.effectiveRate)} {to}/{from}</b>
            {preview.effectiveRate < 1 && <> (= {formatRate(1 / preview.effectiveRate)} {from}/{to})</>}.
            {preview.expected !== null ? (
              <> A la referencia habrías recibido <b>{formatMoney(preview.expected, to)}</b>: {preview.diff! < 0 ? 'pierdes' : 'ganas'} <b>{formatMoney(Math.abs(preview.diff!), to)}</b> ({((preview.diffPct ?? 0) * 100).toFixed(2)} %).</>
            ) : (
              <> Añade una tasa de referencia para saber cuánto pierdes.</>
            )}
          </div>
        </div>
      )}
      <button className="btn primary block mt" disabled={!preview || fromId === toId} onClick={save}>Guardar cambio</button>
    </Sheet>
  );
}

/**
 * Calculadora de la "ruta del dinero": 800 $ cobrados en Bs a tasa BCV →
 * comprar $ en el paralelo → (opcional) pasar a euros con Wise.
 */
function Calculator() {
  const { data } = useStore();
  const d = today();
  const [nominal, setNominal] = useState('800');
  const [bcv, setBcv] = useState(() => String(rateFor(data, 'USD', 'VES', d, 'BCV') ?? ''));
  const [par, setPar] = useState(() => String(rateFor(data, 'USD', 'VES', d, 'Paralelo') ?? ''));
  const [p2pFee, setP2pFee] = useState('0');
  const [wise, setWise] = useState(true);
  const [wiseRate, setWiseRate] = useState(() => {
    const mid = rateFor(data, 'EUR', 'USD', d);
    return mid ? String(Math.round(mid * 1.006 * 10000) / 10000) : '1.09';
  });
  const [wiseFee, setWiseFee] = useState('4.50');
  const [mid, setMid] = useState(() => String(rateFor(data, 'EUR', 'USD', d) ?? '1.08'));

  const num = (s: string) => Number(s.replace(',', '.'));
  const n = Math.round(num(nominal) * 100);
  const valid = n > 0 && num(bcv) > 0 && num(par) > 0;
  const steps: ChainStep[] = [
    { label: 'Te pagan en Bs a tasa BCV', to: 'VES', rate: num(bcv) },
    { label: 'Compras dólares en el paralelo', to: 'USD', rate: 1 / num(par), feePct: num(p2pFee) / 100 },
  ];
  if (wise && num(wiseRate) > 0) steps.push({ label: 'Envías a euros por Wise', to: 'EUR', rate: 1 / num(wiseRate), feeFixed: Math.round(num(wiseFee) * 100) });
  const result = valid ? simulateChain({ amount: n, currency: 'USD' }, steps, { VES: num(par), EUR: 1 / (num(mid) || 1) }) : [];
  const last = result[result.length - 1];

  return (
    <>
      <div className="card glass">
        <h2>Tu caso</h2>
        <Field label="Te deben (USD)"><input inputMode="decimal" value={nominal} onChange={(e) => setNominal(e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Tasa BCV (Bs/$)"><input inputMode="decimal" value={bcv} onChange={(e) => setBcv(e.target.value)} /></Field>
          <Field label="Tasa paralelo (Bs/$)"><input inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} /></Field>
        </div>
        <Field label="Spread o comisión P2P (%)"><input inputMode="decimal" value={p2pFee} onChange={(e) => setP2pFee(e.target.value)} /></Field>
        <label className="switch-row" style={{ color: 'var(--text)', fontSize: 16 }}>
          <span className="grow">Pasar a euros con Wise</span>
          <input type="checkbox" className="switch" checked={wise} onChange={(e) => setWise(e.target.checked)} />
        </label>
        {wise && (
          <div className="grid2">
            <Field label="Tasa Wise ($ por €)"><input inputMode="decimal" value={wiseRate} onChange={(e) => setWiseRate(e.target.value)} /></Field>
            <Field label="Comisión Wise ($)"><input inputMode="decimal" value={wiseFee} onChange={(e) => setWiseFee(e.target.value)} /></Field>
          </div>
        )}
        {wise && <Field label="Tipo medio real ($ por €)"><input inputMode="decimal" value={mid} onChange={(e) => setMid(e.target.value)} /></Field>}
      </div>

      {valid && last && (
        <div className="card glass">
          <h2>La ruta de tu dinero</h2>
          {result.map((r, i) => (
            <div className="step" key={i}>
              <span className="n">{i}</span>
              <div>
                <div className="small">{r.label}</div>
                <div className="mid" style={{ fontSize: 19 }}>{formatMoney(r.amount, r.currency)}</div>
                {r.currency !== 'USD' && <div className="tiny muted">equivale a {formatMoney(r.value, 'USD')}</div>}
              </div>
              {i > 0 && <span className={`num small ${r.stepDiff < 0 ? 'negc' : 'muted'}`}>{r.stepDiff < 0 ? '−' : ''}{formatMoney(Math.abs(r.stepDiff), 'USD')}</span>}
            </div>
          ))}
          <div className={`alert ${last.totalDiff < 0 ? 'over' : 'good'} mt`}>
            <div>
              <div className="small">De {formatMoney(n, 'USD')} que te deben, te llegan en valor real</div>
              <div className="mid">{formatMoney(last.value, 'USD')}</div>
              <div className="small">
                Pierdes <b>{formatMoney(-last.totalDiff, 'USD')}</b> ({((-last.totalDiff / n) * 100).toFixed(1)} %). Solo por la diferencia BCV/paralelo: <b>{formatMoney(-result[1].stepDiff, 'USD')}</b>.
              </div>
            </div>
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Para negociar: pide que te paguen a tasa paralela o en divisas. Para cobrar {formatMoney(n, 'USD')} reales en Bs necesitarías {formatMoney(Math.round(n * num(par)), 'VES')}.</p>
        </div>
      )}
    </>
  );
}

function Rates() {
  const { data, update } = useStore();
  const [base, setBase] = useState('USD');
  const [quote, setQuote] = useState('VES');
  const [rate, setRate] = useState('');
  const [source, setSource] = useState('BCV');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);

  const latest = useMemo(() => {
    const m = new Map<string, (typeof data.rates)[number]>();
    for (const r of [...data.rates].sort((a, b) => a.date.localeCompare(b.date))) m.set(`${r.base}/${r.quote}/${r.source}`, r);
    return [...m.values()].sort((a, b) => `${a.base}${a.quote}`.localeCompare(`${b.base}${b.quote}`));
  }, [data.rates]);
  const usedCurrencies = [...new Set(data.accounts.map((a) => a.currency))].filter((c) => c !== data.settings.currency);

  const auto = async () => {
    setBusy(true);
    try {
      const r = await fetchRates(data);
      update(() => r.data);
      toast(r.added.length ? `Actualizadas: ${r.added.join(', ')}${r.failed.length ? `. Fallaron: ${r.failed.join(', ')}` : ''}` : `No se pudo descargar ninguna tasa${r.failed.length ? ` (${r.failed.join(', ')})` : ''}.`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card glass">
        <div className="card-head"><h2>Tasas actuales</h2>
          <button className="btn sm tinted" disabled={busy || data.settings.offlineOnly} onClick={auto} title={data.settings.offlineOnly ? 'Desactiva el modo sin terceros en Ajustes' : ''}>{busy ? 'Descargando…' : 'Actualizar'}</button>
        </div>
        {latest.length === 0 && <Empty>Sin tasas. Añade la del día o pulsa Actualizar.</Empty>}
        <ul className="list">
          {latest.map((r) => (
            <li key={r.id}>
              <span className="icon">{currencyInfo(r.base).flag}</span>
              <div className="grow">
                <div>1 {r.base} = <b>{formatRate(r.rate)}</b> {r.quote}</div>
                <div className="small muted">{r.source} · {r.date}</div>
              </div>
              <button className="btn ghost sm" aria-label="Eliminar tasa" onClick={() => update((d) => ({ ...d, rates: d.rates.filter((x) => x.id !== r.id) }))}><Icon name="trash" size={16} /></button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card glass">
        <h2>Añadir tasa</h2>
        <div className="grid2">
          <Field label="1 unidad de"><select value={base} onChange={(e) => setBase(e.target.value)}>{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
          <Field label="equivale a"><select value={quote} onChange={(e) => setQuote(e.target.value)}>{CURRENCIES.map((c) => <option key={c.code}>{c.code}</option>)}</select></Field>
        </div>
        <div className="grid2">
          <Field label="Tasa"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="p. ej. 216,5" /></Field>
          <Field label="Fuente"><select value={source} onChange={(e) => setSource(e.target.value)}>{RATE_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>
        <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <button
          className="btn primary block"
          disabled={!(Number(rate.replace(',', '.')) > 0) || base === quote}
          onClick={() => {
            update((d) => addRate(d, { date, base, quote, rate: Number(rate.replace(',', '.')), source }));
            setRate('');
            toast('Tasa guardada');
          }}
        >
          Guardar tasa
        </button>
      </div>

      {usedCurrencies.length > 0 && (
        <div className="card glass">
          <h2>Tasa con la que valorar cada moneda</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Se usa para convertir saldos y movimientos a {data.settings.currency} y para medir pérdidas.</p>
          {usedCurrencies.map((c) => (
            <Field key={c} label={`${currencyInfo(c).flag} ${c}`}>
              <select value={data.settings.rateSource?.[c] ?? ''} onChange={(e) => update((d) => ({ ...d, settings: { ...d.settings, rateSource: { ...d.settings.rateSource, [c]: e.target.value } } }))}>
                <option value="">La más reciente de cualquier fuente</option>
                {RATE_SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          ))}
        </div>
      )}
    </>
  );
}
