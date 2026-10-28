import { detectFees, detectSubscriptions, FEE_TIPS, isActive, type Subscription } from '../lib/insights';
import { formatMoney, today } from '../lib/money';
import { useStore } from '../store';
import { Empty, Money } from '../components/ui';

const FREQ: Record<string, string> = { weekly: 'semanal', monthly: 'mensual', quarterly: 'trimestral', yearly: 'anual' };

export function Subscriptions() {
  const { data } = useStore();
  const now = today();
  const all = detectSubscriptions(data);
  const active = all.filter((s) => isActive(s, now));
  const inactive = all.filter((s) => !isActive(s, now));
  const fees = detectFees(data);
  const yearlyFees = fees.filter((f) => f.date >= new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)).reduce((s, f) => s + f.amountBase, 0);
  const kinds = [...new Set(fees.map((f) => f.kind))];

  return (
    <>
      <RecurringCard title="Suscripciones activas" items={active.filter((x) => x.kind === 'subscription')} hint />
      <RecurringCard title="Recibos fijos" items={active.filter((x) => x.kind === 'bill')} />

      {inactive.length > 0 && (
        <div className="card glass">
          <h2>Posiblemente canceladas</h2>
          <ul className="list small">
            {inactive.map((s) => (
              <li key={s.key}><span className="grow">{s.name}</span><span className="muted">último cobro {s.lastDate}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="card glass">
        <h2>Comisiones bancarias</h2>
        {fees.length === 0 ? (
          <Empty>✓ No se han detectado comisiones. ¡Bien!</Empty>
        ) : (
          <>
            <p className="small" style={{ marginTop: 0 }}>Últimos 12 meses: <b>{formatMoney(yearlyFees)}</b> en comisiones.</p>
            {kinds.map((k) => (
              <div className="alert warning small" key={k}><span>💡</span><div>{FEE_TIPS[k]}</div></div>
            ))}
            <ul className="list small">
              {fees.slice(0, 12).map((f) => (
                <li key={f.transactionId}><span className="grow ellipsis">{f.description}</span><span className="muted">{f.date}</span><Money cents={f.amount} currency={f.currency} /></li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

function RecurringCard({ title, items, hint }: { title: string; items: Subscription[]; hint?: boolean }) {
  const { data } = useStore();
  const cheapest = [...items].sort((a, b) => a.yearlyBase - b.yearlyBase)[0];
  return (
    <div className="card glass">
      <h2>{title}</h2>
      <div className="big">{formatMoney(items.reduce((s, x) => s + x.yearlyBase, 0))}<span className="small muted"> /año</span></div>
      {items.length === 0 && <Empty>No se han detectado cobros de este tipo (hacen falta al menos 2 cargos).</Empty>}
      <ul className="list">
        {items.map((s) => (
          <li key={s.key}>
            <span className="icon">{data.categories.find((c) => c.id === s.categoryId)?.icon ?? '🔁'}</span>
            <div className="grow">
              <div className="ellipsis">{s.name}</div>
              <div className="small muted">
                {FREQ[s.frequency]} · próximo ~{s.nextDate}
                {s.priceIncrease ? <span style={{ color: 'var(--warn)' }}> · ↑ subió {formatMoney(s.priceIncrease, s.currency)}</span> : null}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Money cents={s.amount} currency={s.currency} />
              <div className="small muted">{formatMoney(s.yearly, s.currency)}/año</div>
            </div>
          </li>
        ))}
      </ul>
      {hint && cheapest && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          ¿Usas todas? Cancelar {cheapest.name} ({formatMoney(cheapest.amount, cheapest.currency)}) te ahorra {formatMoney(cheapest.yearly, cheapest.currency)} al año.
        </p>
      )}
    </div>
  );
}
