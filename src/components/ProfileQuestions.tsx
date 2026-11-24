import { useState } from 'react';
import { t as _t } from '../lib/i18n';
import type { Profile } from '../lib/types';

const LEVEL: [Profile['level'], string][] = [
  ['none', 'Estoy empezando'],
  ['basic', 'Llevo mis gastos'],
  ['starter', 'Ya ahorro o invierto un poco'],
  ['advanced', 'Invierto con frecuencia'],
];
const GOAL: [Profile['goal'], string][] = [
  ['control', 'Controlar mis gastos'],
  ['save', 'Ahorrar'],
  ['debt', 'Salir de deudas'],
  ['invest', 'Invertir'],
  ['grow', 'Hacer crecer mi patrimonio'],
];
const RISK: [Profile['risk'], string][] = [
  ['low', 'Prefiero no perder nada'],
  ['mid', 'Acepto algo de riesgo'],
  ['high', 'Asumo riesgo por ganar más'],
];

/** Tres preguntas, tres toques: con ellas se personalizan las lecciones y los consejos. */
export function ProfileQuestions({ value, onChange }: { value: Partial<Profile>; onChange: (p: Partial<Profile>) => void }) {
  const group = <K extends keyof Profile>(key: K, title: string, opts: [Profile[K], string][]) => (
    <div style={{ marginBottom: 14 }}>
      <div className="small" style={{ margin: '0 4px 6px', fontWeight: 600 }}>{_t(title)}</div>
      <div className="chips" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
        {opts.map(([v, label]) => (
          <button key={v} type="button" className={`chip ${value[key] === v ? 'on' : ''}`} aria-pressed={value[key] === v} onClick={() => onChange({ ...value, [key]: v })}>{_t(label)}</button>
        ))}
      </div>
    </div>
  );
  return (
    <>
      {group('level', '¿Cómo describes tu experiencia con el dinero?', LEVEL)}
      {group('goal', '¿Qué quieres conseguir primero?', GOAL)}
      {group('risk', 'Si una inversión cae un 20 %…', RISK)}
    </>
  );
}

export const profileComplete = (p: Partial<Profile>): p is Profile => Boolean(p.level && p.goal && p.risk);

/** Tarjeta para quien aún no ha contestado (cuentas anteriores a esta función). */
export function ProfileCard({ onSave }: { onSave: (p: Profile) => void }) {
  const [p, setP] = useState<Partial<Profile>>({});
  return (
    <div className="card glass">
      <h2>{_t("Personaliza tus consejos")}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{_t("Tres toques y las lecciones y avisos se adaptan a tu situación.")}</p>
      <ProfileQuestions value={p} onChange={setP} />
      <button className="btn primary block" disabled={!profileComplete(p)} onClick={() => profileComplete(p) && onSave(p)}>{_t("Guardar")}</button>
    </div>
  );
}
