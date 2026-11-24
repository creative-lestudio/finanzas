import type { BudgetState } from '../lib/budgets';
import { healthReport } from '../lib/health';
import { today } from '../lib/money';
import { useStore } from '../store';
import { Meter } from '../components/ui';
import { t as _t } from '../lib/i18n';

/** Coach financiero: puntuación, desglose por factores y consejos priorizados. */
export function Health() {
  const { data } = useStore();
  const now = today();
  const r = healthReport(data, now.slice(0, 7), Number(now.slice(8)));
  const state = (s: number): BudgetState => (s >= 70 ? 'ok' : s >= 40 ? 'warning' : 'over');

  return (
    <>
      <div className="card glass" style={{ textAlign: 'center' }}>
        <div className="ring" style={{ background: `conic-gradient(var(--accent-fill) ${r.score * 3.6}deg, var(--fill-2) 0)` }}>
          <div>
            <b>{r.score}</b>
          </div>
        </div>
        <div style={{ fontWeight: 600, fontSize: 19, letterSpacing: '-0.02em' }}>{_t(r.grade)}</div>
        {r.monthsOfData < 3 && <p className="small muted">{_t("Basado en")} {r.monthsOfData || _t("menos de 1")} {_t("mes(es) de datos. La puntuación será más precisa con 3 meses.")}</p>}
      </div>

      {r.tips.length > 0 && (
        <div className="card glass">
          <h2>{_t("Tus próximos pasos")}</h2>
          {r.tips.map((t, i) => (
            <div className="step" key={i} style={{ gridTemplateColumns: '26px 1fr' }}>
              <span className="n">{i + 1}</span>
              <div className="small">{t}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card glass">
        <h2>{_t("Desglose")}</h2>
        {r.factors.map((f) => (
          <div key={f.id} style={{ marginBottom: 14 }}>
            <div className="row between small" style={{ marginBottom: 4 }}>
              <span>{f.label}</span>
              <span className="muted">{f.value} · <b style={{ color: 'var(--text)' }}>{f.score}</b>/100</span>
            </div>
            <Meter ratio={f.score / 100} state={state(f.score)} label={_t('{label}: {score} de 100', { label: f.label, score: f.score })} />
          </div>
        ))}
        <p className="small muted" style={{ marginBottom: 0 }}>
          {_t("Pesos: ahorro 30 %, fondo de emergencia 25 %, deuda 20 %, presupuestos 10 %, suscripciones 8 %, fugas 7 %. Esto es orientativo y no constituye asesoramiento financiero.")}
        </p>
      </div>
    </>
  );
}
