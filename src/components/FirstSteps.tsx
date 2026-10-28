import { getSupabaseConfig } from '../lib/sync';
import { useStore } from '../store';
import type { Page } from '../App';
import { Icon } from './icons';

/** Lista de primeros pasos en Inicio: se marca sola a medida que usas la app. */
export function FirstSteps({ go, openAdd }: { go: (p: Page) => void; openAdd: () => void }) {
  const { data, update, sync } = useStore();
  if (data.settings.checklistHidden) return null;

  const steps: { done: boolean; label: string; hint: string; run: () => void }[] = [
    { done: data.transactions.length > 0, label: 'Añade tu primer movimiento', hint: 'Con el botón + o dictándolo', run: openAdd },
    { done: data.budgets.length > 0, label: 'Crea un presupuesto', hint: 'Un tope para una categoría', run: () => go('plan') },
    { done: data.goals.length > 0, label: 'Define una meta de ahorro', hint: 'Con cifra y fecha', run: () => go('plan') },
    { done: data.rates.length > 0, label: 'Anota las tasas de hoy', hint: 'BCV, Paralelo o Euro (si usas bolívares)', run: () => go('fx') },
    ...(getSupabaseConfig() ? [{ done: sync.status !== 'off', label: 'Activa la sincronización', hint: 'Tus datos cifrados en todos tus dispositivos', run: () => go('settings') }] : []),
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <div className="card glass" style={{ padding: 0 }}>
      <div className="card-head" style={{ padding: '16px 18px 0' }}>
        <h2>Primeros pasos · {done} de {steps.length}</h2>
        <button className="link" onClick={() => update((d) => ({ ...d, settings: { ...d.settings, checklistHidden: true } }))}>Ocultar</button>
      </div>
      <div className="steps-bar" aria-hidden><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ul className="list plain">
        {steps.map((s) => (
          <li key={s.label} className="tap" onClick={s.done ? undefined : s.run} style={{ opacity: s.done ? 0.55 : 1 }}>
            <span className={`tick ${s.done ? 'on' : ''}`}>{s.done && <Icon name="check" size={14} stroke={2.6} />}</span>
            <div className="grow">
              <div style={{ textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</div>
              <div className="small muted">{s.hint}</div>
            </div>
            {!s.done && <Icon name="chevron" size={18} className="chev" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
