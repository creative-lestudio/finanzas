import type Anthropic from '@anthropic-ai/sdk';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/icons';
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

const SUGGESTIONS = [
  'Analiza mis finanzas y dime qué mejorar',
  'Propón presupuestos según mis ingresos',
  '¿Cuánto pierdo al cambiar bolívares a dólares?',
  'Ayúdame a crear una meta de ahorro realista',
  '¿Me puedo permitir un gasto de 600 €?',
  '¿Qué deuda o suscripción debería eliminar primero?',
];

// La conversación vive solo en memoria: no se guarda en ningún sitio.
let memory: { items: ChatItem[]; history: Anthropic.Beta.BetaMessageParam[] } = { items: [], history: [] };

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
    memory = { items, history };
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
            icon: g.kind === 'investment' ? '📈' : g.kind === 'debt' ? '💳' : g.kind === 'purchase' ? '🛍️' : '🐷',
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
      <div className="card glass center">
        <div className="app-icon" style={{ width: 64, height: 64 }}><Icon name="sparkles" size={30} /></div>
        <h2 style={{ textTransform: 'none', fontSize: 20, color: 'var(--text)', letterSpacing: '-0.02em' }}>Tu asesor financiero con IA</h2>
        <p className="small secondary">Analiza tus gastos, propone presupuestos y metas medibles y te ayuda a decidir con tus propios números.</p>
        <p className="small" style={{ color: 'var(--warn)' }}>{avail.reason}</p>
        <p className="tiny muted">Actívalo en Ajustes → Inteligencia artificial. Se envía un resumen de tus finanzas a Claude (Anthropic); nunca contraseñas ni IBAN.</p>
      </div>
    );
  }

  return (
    <>
      {items.length === 0 && (
        <div className="card glass">
          <div className="row mb">
            <span className="icon accent"><Icon name="sparkles" size={20} /></span>
            <div className="grow">
              <b>Hola, soy tu asesor.</b>
              <div className="small muted">Conozco tus cuentas, gastos, metas y cambios de divisa. Pregúntame lo que quieras.</div>
            </div>
          </div>
          <div className="stack">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn block tinted" style={{ justifyContent: 'flex-start', fontWeight: 500 }} onClick={() => void send(s)}>{s}</button>
            ))}
          </div>
        </div>
      )}

      <div className="chat">
        {items.map((it, i) => (
          <div key={i} style={{ display: 'contents' }}>
            <div className={`msg ${it.role} ${it.role === 'bot' ? 'glass' : ''}`}>
              {it.role === 'bot' ? <Markdown text={it.text} /> : it.text}
            </div>
            {it.proposals?.map((p, j) => (
              <div key={j} className="card glass" style={{ alignSelf: 'stretch', marginBottom: 0 }}>
                {p.type === 'budgets' ? (
                  <>
                    <h2>Presupuestos propuestos</h2>
                    <ul className="list plain small">
                      {p.budgets.map((b) => (
                        <li key={b.categoryId} style={{ alignItems: 'flex-start' }}>
                          <div className="grow">
                            <div>{cat(b.categoryId)?.icon} {cat(b.categoryId)?.name ?? b.categoryId}</div>
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
                <button className="btn primary block mt" disabled={it.applied?.[j]} onClick={() => apply(i, j)}>
                  {it.applied?.[j] ? <><Icon name="check" size={18} /> Aplicado</> : 'Aplicar'}
                </button>
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="msg bot glass">
            <span className="typing"><i /><i /><i /></span>
          </div>
        )}
        <div ref={end} />
      </div>

      <form className="composer glass" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <textarea rows={1} placeholder="Pregunta a tu asesor…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} aria-label="Mensaje" />
        <button className="icon-btn" disabled={busy || !input.trim()} aria-label="Enviar"><Icon name="send" size={20} stroke={2.4} /></button>
      </form>
      {items.length > 0 && (
        <button className="btn ghost block small muted mt" onClick={() => { setItems([]); setHistory([]); }}>Nueva conversación</button>
      )}
    </>
  );
}
