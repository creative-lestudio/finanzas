import type Anthropic from '@anthropic-ai/sdk';
import { useEffect, useRef, useState } from 'react';
import { CoachAvatar, COACH } from '../components/Coach';
import { CatBadge, Icon } from '../components/icons';
import { Markdown, toast } from '../components/ui';
import { advisorTurn, aiAvailability, type Proposal } from '../lib/ai';
import { formatMoney, today, uid } from '../lib/money';
import { useStore } from '../store';

interface ChatItem {
  role: 'user' | 'bot';
  text: string;
  proposals?: Proposal[];
  applied?: boolean[];
}

const SUGGESTIONS: [string, string, string][] = [
  ['list', 'Revisar mis gastos', 'Revisa mis gastos de este mes y dime en qué puedo recortar.'],
  ['piggy', 'Planificar un ahorro', 'Ayúdame a crear una meta de ahorro realista con mis ingresos.'],
  ['trend', 'Analizar mis inversiones', 'Analiza mis inversiones y dime si voy bien para mis metas.'],
  ['chart', 'Proponer presupuestos', 'Propón presupuestos por categoría según mis ingresos y gastos.'],
  ['swap', 'Mis cambios de divisa', '¿Cuánto estoy perdiendo al cambiar bolívares y dólares? ¿Cómo lo reduzco?'],
  ['info', 'Resolver una duda', '¿Me puedo permitir un gasto de 600 € este mes?'],
];

// La conversación vive solo en memoria: no se guarda en ningún sitio.
let memory: { items: ChatItem[]; history: Anthropic.Beta.BetaMessageParam[]; pending?: string } = { items: [], history: [] };

/** Abre el asesor con una pregunta ya hecha (por ejemplo, desde el consejo de Inicio). */
export function askAdvisor(question: string) {
  memory.pending = question;
}

/** Asesor financiero con IA: analiza tus datos, propone presupuestos y metas, y te ayuda a decidir. */
export function Assistant() {
  const { data, update } = useStore();
  const [items, setItems] = useState<ChatItem[]>(memory.items);
  const [history, setHistory] = useState(memory.history);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const avail = aiAvailability(data);

  useEffect(() => {
    if (memory.pending && avail.ok) {
      const q = memory.pending;
      memory.pending = undefined;
      void send(q);
    }
  }, []);

  useEffect(() => {
    memory = { ...memory, items, history };
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, history]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setItems((x) => [...x, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const turn = await advisorTurn(data, history, q);
      setHistory(turn.messages);
      setItems((x) => [...x, { role: 'bot', text: turn.text || 'Te dejo la propuesta abajo.', proposals: turn.proposals, applied: turn.proposals.map(() => false) }]);
    } catch (e) {
      setItems((x) => [...x, { role: 'bot', text: `No he podido responder: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const apply = (itemIdx: number, pIdx: number) => {
    const p = items[itemIdx].proposals![pIdx];
    if (p.type === 'budgets') {
      update((d) => {
        const budgets = [...d.budgets];
        for (const b of p.budgets) {
          if (!d.categories.some((c) => c.id === b.categoryId)) continue;
          const limit = Math.round(b.limit * 100);
          const i = budgets.findIndex((x) => x.categoryId === b.categoryId);
          if (i >= 0) budgets[i] = { ...budgets[i], limit };
          else budgets.push({ id: uid(), categoryId: b.categoryId, limit, warnAt: 0.8, rollover: false });
        }
        return { ...d, budgets };
      });
      toast(`${p.budgets.length} presupuestos aplicados`);
    } else {
      const g = p.goal;
      update((d) => ({
        ...d,
        goals: [
          ...d.goals,
          {
            id: uid(),
            name: g.name,
            icon: g.kind === 'investment' ? 'trend' : g.kind === 'debt' ? 'card' : g.kind === 'purchase' ? 'gift' : 'piggy',
            kind: g.kind,
            currency: g.currency,
            target: Math.round(g.target * 100),
            saved: 0,
            deadline: g.deadline,
            monthlyPlan: Math.round(g.monthlyPlan * 100),
            expectedReturn: g.expectedReturn || undefined,
            priority: d.goals.length + 1,
            startDate: today(),
            startAmount: 0,
          },
        ],
      }));
      toast(`Meta "${g.name}" creada`);
    }
    setItems((x) => x.map((it, i) => (i === itemIdx ? { ...it, applied: it.applied!.map((a, j) => (j === pIdx ? true : a)) } : it)));
  };

  const cat = (id: string) => data.categories.find((c) => c.id === id);

  if (!avail.ok) {
    return (
      <>
        <div className="coach-hero">
          <img src={COACH.curioso} alt="Tu asistente financiero" />
          <div className="bubble"><b>¡Hola!</b>Soy tu asistente financiero. Para hablar conmigo necesito que actives la IA.</div>
        </div>
        <div className="card glass mt">
          <p className="small" style={{ marginTop: 0, color: 'var(--warn)' }}>{avail.reason}</p>
          <p className="small secondary">Analizo tus gastos, propongo presupuestos y metas medibles y te ayudo a decidir con tus propios números.</p>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Actívalo en Ajustes → Inteligencia artificial. Se envía un resumen de tus finanzas a Claude (Anthropic); nunca contraseñas ni IBAN.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {items.length === 0 && (
        <>
          <div className="coach-hero">
            <img src={COACH.hola} alt="Tu asistente financiero saludando" />
            <div className="bubble"><b>¡Hola!</b>Soy tu asistente financiero. ¿En qué puedo ayudarte hoy?</div>
          </div>
          <div className="suggest">
            {SUGGESTIONS.map(([icon, label, q]) => (
              <button key={label} onClick={() => void send(q)}>
                <span className="si"><Icon name={icon} size={17} /></span>
                {label}
                <Icon name="chevron" size={15} className="chev" />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="chat">
        {items.map((it, i) => (
          <div key={i} style={{ display: 'contents' }}>
            {it.role === 'bot' ? (
              <div className="coach-row">
                <CoachAvatar pose={it.proposals?.length ? 'explica' : 'seguro'} />
                <div className="msg bot glass"><Markdown text={it.text} /></div>
              </div>
            ) : (
              <div className="msg user">{it.text}</div>
            )}
            {it.proposals?.map((p, j) => (
              <div key={j} className="card glass" style={{ alignSelf: 'stretch', marginBottom: 0 }}>
                {p.type === 'budgets' ? (
                  <>
                    <h2>Presupuestos propuestos</h2>
                    <ul className="list plain small">
                      {p.budgets.map((b) => (
                        <li key={b.categoryId} style={{ alignItems: 'flex-start' }}>
                          <div className="grow">
                            <div className="row"><CatBadge id={b.categoryId} emoji={cat(b.categoryId)?.icon} size={16} />{cat(b.categoryId)?.name ?? b.categoryId}</div>
                            <div className="tiny muted">{b.reason}</div>
                          </div>
                          <b className="num">{formatMoney(Math.round(b.limit * 100))}</b>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <h2>Meta propuesta</h2>
                    <div className="mid" style={{ fontSize: 19 }}>{p.goal.name}</div>
                    <div className="kv mt">
                      <span className="muted">Objetivo</span><b>{formatMoney(Math.round(p.goal.target * 100), p.goal.currency)}</b>
                      <span className="muted">Fecha límite</span><span>{p.goal.deadline}</span>
                      <span className="muted">Aportación mensual</span><span>{formatMoney(Math.round(p.goal.monthlyPlan * 100), p.goal.currency)}</span>
                      {p.goal.expectedReturn > 0 && <><span className="muted">Rentabilidad esperada</span><span>{p.goal.expectedReturn} %</span></>}
                    </div>
                    <p className="tiny muted">{p.goal.reason}</p>
                  </>
                )}
                {it.applied?.[j] ? (
                  <div className="row mt" style={{ gap: 12 }}>
                    <CoachAvatar pose="motiva" size={44} />
                    <div className="small"><b className="pos">¡Hecho!</b> Ya está aplicado. Te aviso de cómo vas.</div>
                  </div>
                ) : (
                  <button className="btn primary block mt" onClick={() => apply(i, j)}>Aplicar</button>
                )}
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="coach-row">
            <CoachAvatar pose="pensando" />
            <div className="msg bot glass">
              <div className="small muted" style={{ marginBottom: 2 }}>Analizando tus finanzas…</div>
              <span className="typing"><i /><i /><i /></span>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <form className="composer lg" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea rows={1} placeholder="Pregúntame lo que quieras…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} aria-label="Mensaje" />
        <button className="icon-btn" disabled={busy || !input.trim()} aria-label="Enviar"><Icon name="send" size={20} stroke={2.4} /></button>
      </form>
      {items.length > 0 && (
        <button className="btn ghost block small muted mt" onClick={() => { setItems([]); setHistory([]); }}>Nueva conversación</button>
      )}
    </>
  );
}
