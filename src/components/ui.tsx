import { useEffect, useState, type ReactNode } from 'react';
import { formatMoney } from '../lib/money';
import type { BudgetState } from '../lib/budgets';

export function Money({ cents, sign = false, className = '' }: { cents: number; sign?: boolean; className?: string }) {
  const text = formatMoney(cents);
  return (
    <span className={`num ${sign && cents > 0 ? 'pos' : ''} ${className}`}>
      {sign && cents > 0 ? '+' : ''}
      {text}
    </span>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATE_LABEL: Record<BudgetState, string> = { ok: '✓ En orden', warning: '⚠ Cerca del tope', over: '✕ Superado' };

export function StateBadge({ state }: { state: BudgetState }) {
  return <span className={`badge ${state}`}>{STATE_LABEL[state]}</span>;
}

export function Meter({ ratio, state, label }: { ratio: number; state: BudgetState | 'goal'; label: string }) {
  return (
    <div className={`meter ${state}`} role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

/** Barras horizontales de una sola serie: el valor va siempre en texto junto a la barra. */
export function Bars({ rows }: { rows: { label: string; value: number; title?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label} title={r.title ?? `${r.label}: ${formatMoney(r.value)}`}>
          <span className="ellipsis">{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <Money cents={r.value} />
        </div>
      ))}
    </div>
  );
}

let toastSet: ((s: string | null) => void) | null = null;

export function toast(msg: string) {
  toastSet?.(msg);
}

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
    return () => {
      toastSet = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3500);
    return () => window.clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted small" style={{ textAlign: 'center', padding: '12px 0' }}>{children}</p>;
}
