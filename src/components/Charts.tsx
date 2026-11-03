import { formatMoney } from '../lib/money';
import type { MonthTotals } from '../lib/reports';

const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const monthLabel = (m: string) => MONTH_SHORT.format(new Date(`${m}-15`)).replace('.', '');

/** Barras de ingresos (verde) y gastos (rojo) por mes. */
export function MonthBars({ rows, base }: { rows: MonthTotals[]; base: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expenses]));
  const H = 130;
  const W = Math.max(rows.length * 44, 280);
  const bw = Math.min(14, (W / rows.length - 10) / 2);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H + 26}`} width="100%" style={{ minWidth: Math.min(W, rows.length * 44), display: 'block' }} role="img" aria-label="Ingresos y gastos por mes">
        {[0.5, 1].map((g) => <line key={g} x1="0" x2={W} y1={H - g * H} y2={H - g * H} stroke="var(--hairline)" strokeWidth="1" />)}
        {rows.map((r, i) => {
          const cx = (i + 0.5) * (W / rows.length);
          const hi = (r.income / max) * H;
          const he = (r.expenses / max) * H;
          return (
            <g key={r.month}>
              <title>{`${monthLabel(r.month)}: ingresos ${formatMoney(r.income, base)}, gastos ${formatMoney(r.expenses, base)}`}</title>
              <rect x={cx - bw - 1} y={H - hi} width={bw} height={Math.max(hi, 1)} rx="3" fill="var(--good)" />
              <rect x={cx + 1} y={H - he} width={bw} height={Math.max(he, 1)} rx="3" fill="var(--bad)" />
              <text x={cx} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{monthLabel(r.month)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Anillo con el reparto por categoría; cada porción usa el color de su categoría. */
export function Donut({ parts, size = 148, center }: { parts: { id: string; value: number; color: string }[]; size?: number; center?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 52;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label="Reparto por categoría">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--fill-2)" strokeWidth="18" />
      {total > 0 && parts.map((p) => {
        const len = (p.value / total) * C;
        const el = <circle key={p.id} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)" />;
        acc += len;
        return el;
      })}
      {center && <text x="70" y="75" textAnchor="middle" fontSize="15" fontWeight="650" fill="var(--text)" style={{ fontFamily: 'var(--font-display)' }}>{center}</text>}
    </svg>
  );
}
