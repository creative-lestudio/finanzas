import { useEffect, useState } from 'react';
import { supabase } from '../lib/sync';
import { Icon } from './icons';

const redirectUrl = () => `${location.origin}${location.pathname}`;

/** Inicio de sesión / registro: Google o correo y contraseña, con recuperación de contraseña. */
export function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const sb = supabase();

  if (!sb) return <p className="small muted">La sincronización no está configurada en esta instalación.</p>;

  const say = (text: string, ok = false) => setMsg({ text, ok });
  const friendly = (m: string) =>
    m === 'Invalid login credentials' ? 'Email o contraseña incorrectos.'
    : /already registered/i.test(m) ? 'Ese correo ya tiene cuenta. Inicia sesión.'
    : /email not confirmed/i.test(m) ? 'Confirma tu correo: te enviamos un enlace.'
    : /rate limit/i.test(m) ? 'Demasiados intentos. Espera unos minutos.'
    : /password should be/i.test(m) ? 'La contraseña debe tener al menos 8 caracteres.'
    : m;

  const google = async () => {
    setBusy(true);
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
    if (error) {
      setBusy(false);
      say(/provider is not enabled/i.test(error.message) ? 'El acceso con Google aún no está activado en el servidor.' : friendly(error.message));
    }
  };

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    if (mode === 'reset') {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
      setBusy(false);
      // Siempre el mismo mensaje: no se revela si el correo tiene cuenta.
      return error ? say(friendly(error.message)) : say('Si ese correo tiene cuenta, te hemos enviado un enlace para elegir otra contraseña.', true);
    }
    const r = mode === 'in' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectUrl() } });
    setBusy(false);
    if (r.error) return say(friendly(r.error.message));
    if (mode === 'up' && !r.data.session) {
      setMode('in');
      return say('Te hemos enviado un correo para confirmar la cuenta. Ábrelo y vuelve aquí para iniciar sesión.', true);
    }
    onDone();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {mode !== 'reset' && (
        <>
          <button type="button" className="btn block" onClick={() => void google()} disabled={busy} style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 0.5px var(--hairline)' }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3A12 12 0 1 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 44 24c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
            Continuar con Google
          </button>
          <div className="row tiny muted" style={{ margin: '14px 0' }}><hr style={{ flex: 1, border: 0, borderTop: '0.5px solid var(--hairline)' }} />o con tu correo<hr style={{ flex: 1, border: 0, borderTop: '0.5px solid var(--hairline)' }} /></div>
          <div className="seg">
            <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => { setMode('in'); setMsg(null); }}>Iniciar sesión</button>
            <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => { setMode('up'); setMsg(null); }}>Crear cuenta</button>
          </div>
        </>
      )}
      {mode === 'reset' && <p className="small secondary" style={{ marginTop: 0 }}>Escribe tu correo y te enviamos un enlace para elegir otra contraseña de cuenta.</p>}
      <div className="field"><input type="email" autoComplete="email" placeholder="Correo electrónico" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Correo electrónico" /></div>
      {mode !== 'reset' && (
        <div className="field"><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Contraseña de la cuenta" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Contraseña de la cuenta" /></div>
      )}
      {msg && <p className="small" style={{ color: msg.ok ? 'var(--good)' : 'var(--bad)' }}>{msg.text}</p>}
      <button className="btn primary block" disabled={busy || !email || (mode !== 'reset' && password.length < 8)}>
        {busy ? 'Un momento…' : mode === 'in' ? 'Iniciar sesión' : mode === 'up' ? 'Crear cuenta' : 'Enviar enlace'}
      </button>
      {mode === 'in' && <button type="button" className="btn ghost block small mt" onClick={() => { setMode('reset'); setMsg(null); }}>He olvidado la contraseña</button>}
      {mode === 'reset' && <button type="button" className="btn ghost block small mt" onClick={() => { setMode('in'); setMsg(null); }}>Volver</button>}
      <p className="tiny muted center" style={{ marginBottom: 0 }}>La contraseña de la cuenta es distinta de la de cifrado: el servidor nunca ve esta última ni tus datos.</p>
    </form>
  );
}

/** Pantalla para elegir contraseña nueva tras abrir el enlace de recuperación del correo. */
export function RecoveryNotice({ children }: { children: React.ReactNode }) {
  const [recovering, setRecovering] = useState(false);
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const sb = supabase();

  useEffect(() => {
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((ev) => ev === 'PASSWORD_RECOVERY' && setRecovering(true));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  if (!recovering || !sb) return <>{children}</>;
  return (
    <form className="card lg" style={{ marginBottom: 14 }} onSubmit={async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: pass });
      if (error) setMsg(error.message);
      else setRecovering(false);
    }}>
      <h2>Elige tu nueva contraseña de cuenta</h2>
      <div className="field"><input type="password" autoComplete="new-password" placeholder="Nueva contraseña (mín. 8)" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Nueva contraseña de la cuenta" /></div>
      {msg && <p className="small" style={{ color: 'var(--bad)' }}>{msg}</p>}
      <button className="btn primary block" disabled={pass.length < 8}><Icon name="check" size={18} /> Guardar</button>
    </form>
  );
}
