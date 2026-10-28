import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { formatMoney } from '../lib/money';
import type { BudgetState } from '../lib/budgets';
import { Icon } from './icons';

export function Money({ cents, currency, sign = false, className = '' }: { cents: number; currency?: string; sign?: boolean; className?: string }) {
  return (
    <span className={`num ${sign && cents > 0 ? 'pos' : ''} ${className}`}>
      {sign && cents > 0 ? '+' : ''}
      {formatMoney(cents, currency)}
    </span>
  );
}

export function Sheet({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <div className="row">
            {action}
            <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Cerrar">
              <Icon name="close" size={16} stroke={2.4} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const STATE_LABEL: Record<BudgetState, string> = { ok: 'En orden', warning: 'Cerca del tope', over: 'Superado' };

export function StateBadge({ state }: { state: BudgetState }) {
  return <span className={`badge ${state}`}>{STATE_LABEL[state]}</span>;
}

export function Meter({ ratio, state, label, mark }: { ratio: number; state: BudgetState | 'goal'; label: string; mark?: number | null }) {
  return (
    <div className={`meter ${state === 'goal' ? '' : state}`} role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
      {mark != null && <span className="mark" style={{ left: `${Math.min(100, mark * 100)}%` }} title="Donde deberías ir hoy" />}
    </div>
  );
}

/** Barras horizontales de una sola serie: el valor va siempre en texto junto a la barra. */
export function Bars({ rows, currency }: { rows: { label: string; value: number }[]; currency?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label} title={`${r.label}: ${formatMoney(r.value, currency)}`}>
          <span className="ellipsis">{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <Money cents={r.value} currency={currency} className="small" />
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
    const t = window.setTimeout(() => setMsg(null), 3800);
    return () => window.clearTimeout(t);
  }, [msg]);
  return msg ? (
    <div className="toast lg" role="status" onClick={() => setMsg(null)}>
      {msg}
    </div>
  ) : null;
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

export function Switch({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className="switch-row" style={{ margin: 0, fontSize: 16, color: 'var(--text)', fontWeight: 400 }}>
      <span className="grow">{children}</span>
      <input type="checkbox" className="switch" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Markdown mínimo y seguro (negrita, listas, títulos) para las respuestas del asistente. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>)}</ol>;
        if (/^#{1,4}\s/.test(b)) return <h4 key={i}>{inline(b.replace(/^#+\s/, ''))}</h4>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </>
  );
}
