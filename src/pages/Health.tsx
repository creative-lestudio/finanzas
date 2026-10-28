import type { BudgetState } from '../lib/budgets';
import { healthReport } from '../lib/health';
import { today } from '../lib/money';
import { useStore } from '../store';
import { Meter } from '../components/ui';

/** Coach financiero: puntuación, desglose por factores y consejos priorizados. */
export function Health() {
  const { data } = useStore();
  const now = today();
  const r = healthReport(data, now.slice(0, 7), Number(now.slice(8)));
  const state = (s: number): BudgetState => (s >= 70 ? 'ok' : s >= 40 ? 'warning' : 'over');

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="score" style={{ background: `conic-gradient(var(--accent) ${r.score * 3.6}deg, var(--surface-2) 0)` }}>
          <div className="score" style={{ width: 96, height: 96, margin: 0, background: 'var(--surface)' }}>
            <b>{r.score}</b>
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{r.grade}</div>
        {r.monthsOfData < 3 && <p className="small muted">Basado en {r.monthsOfData || 'menos de 1'} mes(es) de datos. La puntuación será más precisa con 3 meses.</p>}
      </div>

      {r.tips.length > 0 && (
        <div className="card">
          <h2>Tus próximos pasos</h2>
          {r.tips.map((t, i) => (
            <div className="alert" key={i}>
              <b>{i + 1}</b>
              <div className="small">{t}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Desglose</h2>
        {r.factors.map((f) => (
          <div key={f.id} style={{ marginBottom: 14 }}>
            <div className="row between small" style={{ marginBottom: 4 }}>
              <span>{f.label}</span>
              <span className="muted">{f.value} · <b style={{ color: 'var(--text)' }}>{f.score}</b>/100</span>
            </div>
            <Meter ratio={f.score / 100} state={state(f.score)} label={`${f.label}: ${f.score} de 100`} />
          </div>
        ))}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Pesos: ahorro 30 %, fondo de emergencia 25 %, deuda 20 %, presupuestos 10 %, suscripciones 8 %, fugas 7 %. Esto es orientativo y no constituye asesoramiento financiero.
        </p>
      </div>
    </>
  );
}
