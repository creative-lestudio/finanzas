import { useMemo } from 'react';
import { rankLessons } from '../lib/lessons';
import { dismissMentor, mentorMessages, type MentorMsg } from '../lib/mentor';
import { t as _t } from '../lib/i18n';
import { useStore } from '../store';
import type { Page } from '../App';
import { Icon } from './icons';

const ICON = { warn: 'bolt', tip: 'sparkles', praise: 'heart' } as const;
const LABEL = { warn: 'Aviso', tip: 'Consejo', praise: 'Felicitación' } as const;

/** Abre una lección concreta en la sección Aprende. */
export function openLesson(go: (p: Page) => void, id: string) {
  try {
    sessionStorage.setItem('finanzas.lesson', id);
  } catch {
    /* ignorado */
  }
  go('learn');
}

/** El mentor en Inicio: lo más importante ahora (avisos primero, luego consejos, y felicitaciones). */
export function MentorCard({ go }: { go: (p: Page) => void }) {
  const { data, update } = useStore();
  const msgs = useMemo(() => mentorMessages(data), [data]);
  // Un aviso o consejo y, si lo hay, una felicitación: sin saturar.
  const main = msgs.find((m) => m.kind !== 'praise');
  const praise = msgs.find((m) => m.kind === 'praise');
  const show = [main, praise].filter(Boolean) as MentorMsg[];
  if (!show.length) return null;
  return (
    <>
      {show.map((m) => (
        <div key={m.id} className={`card glass mentor ${m.kind}`} role={m.kind === 'warn' ? 'alert' : undefined}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span className={`icon ${m.kind === 'warn' ? '' : 'accent'}`} style={m.kind === 'warn' ? { color: 'var(--bad)' } : m.kind === 'praise' ? { color: 'var(--good)' } : undefined}><Icon name={ICON[m.kind]} size={20} /></span>
            <div className="grow">
              <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{_t(LABEL[m.kind])}</div>
              <div style={{ fontWeight: 650, margin: '2px 0 3px' }}>{m.title}</div>
              <div className="small">{m.text}</div>
              <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                {m.go && <button className="btn primary sm" onClick={() => go(m.go!)}>{m.goLabel ?? _t('Ver')}</button>}
                {m.lesson && <button className="btn tinted sm" onClick={() => openLesson(go, m.lesson!)}>{_t("Aprender más")}</button>}
                <button className="btn ghost sm" onClick={() => update((d) => dismissMentor(d, m))}>{m.kind === 'praise' ? _t('¡Gracias!') : _t('Entendido')}</button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** Tu próxima lección (3 min), elegida con tu perfil y tu situación. */
export function LearnCard({ go }: { go: (p: Page) => void }) {
  const { data } = useStore();
  const done = new Set(data.settings.learn?.done ?? []);
  const next = useMemo(() => rankLessons(data).find((l) => !done.has(l.id)), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!next) return null;
  return (
    <div className="card glass row tap" style={{ padding: 14, cursor: 'pointer' }} onClick={() => openLesson(go, next.id)} role="button">
      <span className="icon accent"><Icon name={next.icon} size={20} /></span>
      <div className="grow small"><b>{_t("Tu próxima lección")} · {next.minutes} min</b><div className="muted">{_t(next.title)}</div></div>
      <Icon name="chevron" size={18} className="chev" />
    </div>
  );
}
