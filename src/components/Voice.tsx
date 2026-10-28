import { categoryColor } from '../lib/families';
import { useEffect, useRef, useState } from 'react';
import { aiAvailability } from '../lib/ai';
import { detectChannel } from '../lib/categorize';
import { formatMoney, parseAmount } from '../lib/money';
import { accountChoices, listen, parseVoiceAI, parseVoiceLocal, speechSupported, withMissing, type VoiceDraft } from '../lib/voice';
import { useStore } from '../store';
import { CatIcon, Icon } from './icons';
import { saveTransaction } from './QuickAdd';
import { Sheet, toast } from './ui';

/**
 * Registro por voz: pulsa el micro, di "gasté 50 euros en Mercadona" y
 * revisa. Si falta algo (cuenta, categoría, importe) aparecen botones para
 * completarlo con un toque.
 */
export function VoiceSheet({ onClose }: { onClose: () => void }) {
  const { data, update } = useStore();
  const [live, setLive] = useState(false);
  const [text, setText] = useState('');
  const [typed, setTyped] = useState('');
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const stop = useRef<() => void>(() => {});
  const supported = speechSupported();
  const ai = aiAvailability(data);

  const interpret = async (phrase: string) => {
    if (!phrase.trim()) return;
    const local = parseVoiceLocal(phrase, data);
    setDraft(local);
    // La IA solo entra si el intérprete local no lo ha resuelto todo.
    if (ai.ok && local.missing.length) {
      setThinking(true);
      try {
        setDraft(await parseVoiceAI(phrase, data, local));
      } catch {
        /* se queda la interpretación local */
      } finally {
        setThinking(false);
      }
    }
  };

  const start = () => {
    setError('');
    setDraft(null);
    setText('');
    setLive(true);
    stop.current = listen(
      (t, final) => {
        if (t) setText(t);
        if (final) {
          setLive(false);
          void interpret(t);
        }
      },
      (msg) => {
        setLive(false);
        setError(msg);
      },
    );
  };

  useEffect(() => {
    if (supported) start();
    return () => stop.current();
  }, []);

  const set = (patch: Partial<VoiceDraft>) => setDraft((d) => (d ? withMissing({ ...d, ...patch }) : d));
  const account = draft?.accountId ? data.accounts.find((a) => a.id === draft.accountId) : undefined;
  const category = draft?.categoryId ? data.categories.find((c) => c.id === draft.categoryId) : undefined;
  const currency = account?.currency ?? draft?.currency ?? data.settings.currency;
  const currencyMismatch = account && draft?.currency && draft.currency !== account.currency;

  const save = () => {
    if (!draft || draft.missing.length || !draft.amount) return;
    const amount = draft.kind === 'expense' ? -Math.abs(draft.amount) : Math.abs(draft.amount);
    const desc = draft.description || category?.name || 'Movimiento';
    const { next, message } = saveTransaction(data, {
      accountId: draft.accountId!,
      date: draft.date,
      amount,
      description: desc,
      categoryId: draft.categoryId!,
      categorySource: 'user',
      channel: account?.kind === 'cash' ? 'cash' : detectChannel(desc),
      note: `Dictado: "${text || typed}"`,
    });
    update(() => next);
    toast(message);
    onClose();
  };

  const topCats = (() => {
    const freq: Record<string, number> = {};
    for (const t of data.transactions.slice(-300)) freq[t.categoryId] = (freq[t.categoryId] ?? 0) + 1;
    // La categoría elegida va primero para que se vea sin desplazar.
    const sel = draft?.categoryId;
    return data.categories
      .filter((c) => c.kind === (draft?.kind ?? 'expense'))
      .sort((a, b) => (b.id === sel ? 1e9 : freq[b.id] ?? 0) - (a.id === sel ? 1e9 : freq[a.id] ?? 0))
      .slice(0, 10);
  })();

  return (
    <Sheet title="Dictar movimiento" onClose={onClose}>
      {supported ? (
        <>
          <button className={`mic lg tint ${live ? 'live' : ''}`} onClick={() => (live ? stop.current() : start())} aria-label={live ? 'Detener' : 'Hablar'}>
            <Icon name="mic" size={38} stroke={2} />
          </button>
          <div className="transcript">{text || <span className="muted">{live ? 'Te escucho…' : error || 'Pulsa y habla'}</span>}</div>
        </>
      ) : (
        <p className="small muted center">Tu navegador no permite dictado por voz. Escribe la frase igual que la dirías:</p>
      )}
      <form className="row mb" onSubmit={(e) => { e.preventDefault(); setText(typed); void interpret(typed); }}>
        <input placeholder='"Pagué 20 dólares en efectivo en la farmacia"' value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Frase" />
        <button className="btn tinted" disabled={!typed.trim()}>OK</button>
      </form>

      {draft && (
        <div className="card glass" style={{ padding: 16 }}>
          <div className="row between mb">
            <div className="seg" style={{ margin: 0, flex: 1 }}>
              <button className={draft.kind === 'expense' ? 'on' : ''} onClick={() => set({ kind: 'expense', categoryId: null })}>Gasto</button>
              <button className={draft.kind === 'income' ? 'on' : ''} onClick={() => set({ kind: 'income', categoryId: null })}>Ingreso</button>
            </div>
          </div>
          <div className="center mb">
            {draft.amount ? (
              <div className="big">{formatMoney(draft.kind === 'expense' ? -draft.amount : draft.amount, currency)}</div>
            ) : (
              <input inputMode="decimal" className="amount-input" placeholder="¿Cuánto?" autoFocus onBlur={(e) => set({ amount: Math.abs(parseAmount(e.target.value) ?? 0) || null })} aria-label="Importe" />
            )}
            <div className="secondary">{draft.description || '—'} · {draft.date}</div>
            {thinking && <div className="tiny muted mt">Completando con IA…</div>}
          </div>

          <div className="small muted mb">Categoría {draft.missing.includes('category') && <b style={{ color: 'var(--warn)' }}>· elige una</b>}</div>
          <div className="chips mb">
            {topCats.map((c) => (
              <button key={c.id} style={{ ['--c' as string]: categoryColor(c.id) }} className={`chip cat-chip ${draft.categoryId === c.id ? 'on' : ''}`} onClick={() => set({ categoryId: c.id })}><CatIcon id={c.id} emoji={c.icon} size={16} />{c.name}</button>
            ))}
          </div>

          <div className="small muted mb">Cuenta {draft.missing.includes('account') && <b style={{ color: 'var(--warn)' }}>· ¿de dónde sale?</b>}</div>
          <div className="chips mb">
            {(draft.accountId ? [account!, ...accountChoices(data, draft.currency).filter((a) => a.id !== draft.accountId)] : accountChoices(data, draft.currency)).filter(Boolean).map((a) => (
              <button key={a.id} className={`chip ${draft.accountId === a.id ? 'on' : ''}`} onClick={() => set({ accountId: a.id })}>{a.name} · {a.currency}</button>
            ))}
          </div>
          {currencyMismatch && <div className="alert warning small">Has dicho {draft.currency} pero la cuenta es en {account!.currency}. Se guardará en {account!.currency}.</div>}

          <button className="btn primary block mt" disabled={draft.missing.length > 0} onClick={save}>
            {draft.missing.length ? 'Completa los datos' : 'Guardar movimiento'}
          </button>
        </div>
      )}
      {!ai.ok && <p className="tiny muted center">La interpretación se hace en tu dispositivo{ai.reason ? `. IA no disponible: ${ai.reason.replace(/\.$/, '')}` : ''}.</p>}
    </Sheet>
  );
}
