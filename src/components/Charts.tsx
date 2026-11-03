import { formatMoney } from '../lib/money';
import type { MonthTotals } from '../lib/reports';

const MONTH_SHORT = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const monthLabel = (m: string) => MONTH_SHORT.format(new Date(`${m}-15`)).replace('.', '');

/** Barras de ingresos (verde) y gastos (rojo) por mes, con ejes y etiquetas legibles. */
export function MonthBars({ rows, base }: { rows: MonthTotals[]; base: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expenses]));
  const compact = (c: number) => new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(c / 100);
  const H = 150, L = 38, T = 8;
  const step = 64;
  const W = Math.max(L + rows.length * step + 8, 340);
  const bw = 18;
  const x0 = L + (W - L - rows.length * step) / 2;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H + T + 24}`} width="100%" style={{ display: 'block', maxHeight: 230 }} role="img" aria-label="Ingresos y gastos por mes" preserveAspectRatio="xMidYMid meet">
        {[0, 0.5, 1].map((g) => {
          const y = T + H - g * H;
          return (
            <g key={g}>
              <line x1={L} x2={W} y1={y} y2={y} stroke="var(--hairline)" strokeWidth="1" strokeDasharray={g ? '3 4' : undefined} />
              <text x={L - 6} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="var(--text-3, var(--muted))">{g === 0 ? '0' : compact(max * g)}</text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const cx = x0 + (i + 0.5) * step;
          const hi = (r.income / max) * H;
          const he = (r.expenses / max) * H;
          return (
            <g key={r.month}>
              <title>{`${monthLabel(r.month)}: ingresos ${formatMoney(r.income, base)}, gastos ${formatMoney(r.expenses, base)}`}</title>
              <rect x={cx - bw - 2} y={T + H - Math.max(hi, 2)} width={bw} height={Math.max(hi, 2)} rx="5" fill="var(--good)" opacity="0.92" />
              <rect x={cx + 2} y={T + H - Math.max(he, 2)} width={bw} height={Math.max(he, 2)} rx="5" fill="var(--bad)" opacity="0.92" />
              <text x={cx} y={T + H + 17} textAnchor="middle" fontSize="11" fontWeight="550" fill="var(--text-2)">{monthLabel(r.month)}</text>
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
