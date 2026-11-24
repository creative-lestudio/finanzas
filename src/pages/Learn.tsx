import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/icons';
import { Meter, Sheet, toast } from '../components/ui';
import { t as _t } from '../lib/i18n';
import { learnStreak, LESSONS, lessonById, rankLessons, yourCase, type Lesson } from '../lib/lessons';
import { today } from '../lib/money';
import { useStore } from '../store';
import type { Page } from '../App';

/** Aprende: lecciones de 3 minutos, ordenadas para ti, con una pregunta y tu caso con tus números. */
export function Learn({ go }: { go: (p: Page) => void }) {
  const { data, update } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const done = new Set(data.settings.learn?.done ?? []);
  const ranked = useMemo(() => rankLessons(data), [data]);
  const next = ranked.find((l) => !done.has(l.id));
  const streak = learnStreak(data.settings.learn?.days ?? []);

  useEffect(() => {
    try {
      const id = sessionStorage.getItem('finanzas.lesson');
      if (id && lessonById(id)) setOpenId(id);
      sessionStorage.removeItem('finanzas.lesson');
    } catch {
      /* ignorado */
    }
  }, []);

  const finish = (l: Lesson) =>
    update((d) => {
      const cur = d.settings.learn ?? { done: [], days: [] };
      return { ...d, settings: { ...d.settings, learn: { done: [...new Set([...cur.done, l.id])], days: [...new Set([...cur.days, today()])].slice(-60) } } };
    });

  return (
    <>
      <div className="hero glass">
        <div className="small muted">{_t("Tu progreso")}</div>
        <div className="mid">{done.size} / {LESSONS.length} {_t("lecciones")}</div>
        <div style={{ margin: '8px 0 4px' }}><Meter ratio={done.size / LESSONS.length} state="goal" label={_t("Progreso")} /></div>
        {streak > 0 && <div className="small" style={{ color: 'var(--good)' }}>{_t("Racha: {n} día(s) seguidos", { n: streak })}</div>}
      </div>

      {next && (
        <div className="card glass" style={{ cursor: 'pointer' }} onClick={() => setOpenId(next.id)} role="button">
          <div className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{_t("Recomendada para ti")}</div>
          <div className="row" style={{ gap: 12, marginTop: 6 }}>
            <span className="icon accent"><Icon name={next.icon} size={22} /></span>
            <div className="grow"><b>{_t(next.title)}</b><div className="small muted">{next.minutes} min · {_t("con tus números")}</div></div>
            <Icon name="chevron" size={18} className="chev" />
          </div>
          <button className="btn primary block mt" onClick={(e) => { e.stopPropagation(); setOpenId(next.id); }}>{_t("Empezar lección")}</button>
        </div>
      )}

      <div className="card glass flush">
        <ul className="list">
          {ranked.map((l) => (
            <li key={l.id} className="tap" onClick={() => setOpenId(l.id)} style={{ opacity: done.has(l.id) ? 0.6 : 1 }}>
              <span className={`tick ${done.has(l.id) ? 'on' : ''}`}>{done.has(l.id) && <Icon name="check" size={13} stroke={2.6} />}</span>
              <div className="grow"><div>{_t(l.title)}</div><div className="small muted">{l.minutes} min</div></div>
              <Icon name="chevron" size={18} className="chev" />
            </li>
          ))}
        </ul>
      </div>
      <p className="tiny muted center">{_t("Contenido educativo general; no es asesoramiento financiero personalizado.")}</p>

      {openId && lessonById(openId) && (
        <Sheet title={_t(lessonById(openId)!.title)} onClose={() => setOpenId(null)}>
          <LessonView lesson={lessonById(openId)!} caseText={yourCase(data, openId)} onDone={() => { finish(lessonById(openId)!); toast(_t('¡Lección completada!')); }} onGo={(p) => { setOpenId(null); go(p); }} />
        </Sheet>
      )}
    </>
  );
}

function LessonView({ lesson, caseText, onDone, onGo }: { lesson: Lesson; caseText: string | null; onDone: () => void; onGo: (p: Page) => void }) {
  const total = lesson.cards.length;
  const [step, setStep] = useState(0); // 0..total-1 tarjetas, total = pregunta, total+1 = resultado
  const [pick, setPick] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  if (step < total) {
    return (
      <>
        <div className="steps-bar" aria-hidden><i style={{ width: `${((step + 1) / (total + 2)) * 100}%` }} /></div>
        <p style={{ fontSize: 18, lineHeight: 1.5, minHeight: 120 }}>{_t(lesson.cards[step])}</p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" style={{ visibility: step === 0 ? 'hidden' : 'visible' }} onClick={() => setStep(step - 1)}>{_t("Atrás")}</button>
          <button className="btn primary grow" onClick={() => setStep(step + 1)}>{step === total - 1 ? _t('Comprobar lo aprendido') : _t('Siguiente')}</button>
        </div>
      </>
    );
  }
  if (step === total) {
    const right = pick === lesson.quiz.answer;
    return (
      <>
        <div className="steps-bar" aria-hidden><i style={{ width: `${((total + 1) / (total + 2)) * 100}%` }} /></div>
        <p style={{ fontSize: 18, fontWeight: 600 }}>{_t(lesson.quiz.q)}</p>
        <div style={{ display: 'grid', gap: 8 }}>
          {lesson.quiz.options.map((o, i) => (
            <button key={i} className="btn block" disabled={pick !== null} onClick={() => setPick(i)} style={pick === null ? undefined : i === lesson.quiz.answer ? { background: 'var(--good)', color: '#fff' } : i === pick ? { background: 'var(--bad)', color: '#fff' } : { opacity: 0.5 }}>{_t(o)}</button>
          ))}
        </div>
        {pick !== null && (
          <>
            <p className="small" style={{ marginTop: 12 }}><b>{right ? _t('¡Correcto!') : _t('Casi.')}</b> {_t(lesson.quiz.why)}</p>
            <button className="btn primary block" onClick={() => { setStep(total + 1); if (!finished) { setFinished(true); onDone(); } }}>{_t("Ver tu caso")}</button>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <div className="steps-bar" aria-hidden><i style={{ width: '100%' }} /></div>
      <h2>{_t("Aplícalo a tu caso")}</h2>
      <p style={{ fontSize: 17, lineHeight: 1.5 }}>{caseText ?? _t('Registra algunos movimientos y aquí verás esta lección con tus propios números.')}</p>
      {lesson.go && <button className="btn primary block" onClick={() => onGo(lesson.go as Page)}>{_t(lesson.goLabel ?? 'Ir')}</button>}
      <button className="btn ghost block mt" onClick={() => setStep(0)}>{_t("Repasar la lección")}</button>
    </>
  );
}
