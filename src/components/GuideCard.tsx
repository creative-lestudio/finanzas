import { finishGuide, guideTasks, patchGuide } from '../lib/guide';
import { useStore } from '../store';
import type { Page } from '../App';
import { COACH } from './Coach';
import { Icon } from './icons';

/** Lista de las tres primeras tareas, presentada por el asistente. Desaparece al completarla o al saltarla. */
export function GuideCard({ go, openAdd, setupPending }: { go: (p: Page) => void; openAdd: () => void; setupPending: boolean }) {
  const { data, update } = useStore();
  const g = guideTasks(data);
  if (!g) return null;

  const tasks = [
    {
      key: 'accounts' as const,
      done: g.accounts,
      label: 'Configura tus cuentas y saldos',
      hint: 'Para empezar a registrar desde un punto de partida real',
      say: 'Primero, tus cuentas. Pon cuánto tienes ahora en cada una (banco, efectivo, dólares…): ese será tu punto de partida y todo lo que registres después se sumará o restará desde ahí.',
      run: () => (setupPending ? window.scrollTo({ top: 0, behavior: 'smooth' }) : go('accounts')),
    },
    {
      key: 'movement' as const,
      done: g.movement,
      label: 'Registra un movimiento',
      hint: 'Como prueba o como registro real, tú eliges',
      say: 'Ahora un movimiento. Con el botón + anotas un gasto o ingreso en segundos (o lo dictas). Al guardarlo elige si es una prueba, que borraré al terminar, o un registro real.',
      run: openAdd,
    },
    {
      key: 'budget' as const,
      done: g.budget,
      label: 'Planifica un presupuesto',
      hint: 'Un tope mensual por categoría, de prueba o real',
      say: 'Por último, un presupuesto: un tope mensual para una categoría, como supermercado. Te aviso antes de que te pases. También puedes crearlo de prueba y lo elimino al terminar.',
      run: () => go('plan'),
    },
  ];
  const current = tasks.find((t) => !t.done) ?? tasks[0];
  const done = tasks.filter((t) => t.done).length;

  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="coach-hero" style={{ borderRadius: 0 }}>
        <img src={COACH.hola} alt="" />
        <div className="bubble"><b>Tarea {done + 1 > 3 ? 3 : done + 1} de 3</b>{current.say}</div>
      </div>
      <div className="steps-bar" aria-hidden><i style={{ width: `${(done / tasks.length) * 100}%` }} /></div>
      <ul className="list plain" style={{ padding: '0 18px' }}>
        {tasks.map((t, i) => (
          <li key={t.key} className="tap" onClick={t.done ? undefined : t.run} style={{ opacity: t.done ? 0.55 : 1 }}>
            <span className={`tick ${t.done ? 'on' : ''}`}>{t.done ? <Icon name="check" size={14} stroke={2.6} /> : <small>{i + 1}</small>}</span>
            <div className="grow">
              <div style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</div>
              <div className="small muted">{t.hint}</div>
            </div>
            {!t.done && <Icon name="chevron" size={18} className="chev" />}
          </li>
        ))}
      </ul>
      <div className="row" style={{ padding: '4px 18px 14px', justifyContent: 'space-between' }}>
        <button className="btn primary sm" onClick={current.run}>{current.key === 'accounts' ? 'Configurar cuentas' : current.key === 'movement' ? 'Registrar movimiento' : 'Crear presupuesto'}</button>
        <button className="link" onClick={() => update((d) => finishGuide(d))}>Saltar guía</button>
      </div>
    </div>
  );
}

/** Comentario del asistente dentro de una pantalla mientras se hace una tarea de la guía. */
export function GuideTip({ task }: { task: 'accounts' | 'budget' }) {
  const { data, update } = useStore();
  const g = guideTasks(data);
  if (!g || g[task]) return null;
  const hasAccounts = data.accounts.length > 0;
  return (
    <div className="card glass" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="coach-hero" style={{ borderRadius: 0 }}>
        <img src={COACH.hola} alt="" />
        <div className="bubble">
          {task === 'accounts' ? (
            <>
              <b>Tus cuentas y saldos</b>
              Aquí ves cada cuenta con su saldo. Toca <b>Editar</b> para poner lo que tienes hoy y usa <b>+</b> si te falta alguna. Cuando estén todas, confírmalo.
            </>
          ) : (
            <>
              <b>Tu primer presupuesto</b>
              Toca <b>Nuevo presupuesto</b>, elige una categoría y el tope del mes. Verás una barra que se llena según gastes. Al guardarlo elige si es de prueba o real.
            </>
          )}
        </div>
      </div>
      {task === 'accounts' && (
        <div style={{ padding: '12px 18px 16px' }}>
          <button className="btn primary block" disabled={!hasAccounts} onClick={() => update((d) => patchGuide(d, { accounts: true }))}>Ya están mis cuentas y saldos</button>
          {!hasAccounts && <p className="tiny muted center" style={{ marginBottom: 0 }}>Crea al menos una cuenta para continuar.</p>}
        </div>
      )}
    </div>
  );
}
