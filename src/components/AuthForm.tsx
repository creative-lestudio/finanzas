import { useState } from 'react';
import { supabase } from '../lib/sync';

/** Inicio de sesión / registro con email y contraseña en Supabase. */
export function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const sb = supabase();

  if (!sb) return <p className="small muted">La sincronización no está configurada en esta instalación.</p>;

  const submit = async () => {
    setBusy(true);
    setMsg('');
    const redirect = `${location.origin}${location.pathname}`;
    const r = mode === 'in'
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (r.error) {
      setMsg(r.error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : r.error.message);
      return;
    }
    if (mode === 'up' && !r.data.session) {
      setMsg('Te hemos enviado un email para confirmar la cuenta. Ábrelo y vuelve aquí para iniciar sesión.');
      setMode('in');
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div className="seg">
        <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Iniciar sesión</button>
        <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Crear cuenta</button>
      </div>
      <div className="field"><input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" /></div>
      <div className="field"><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="Contraseña de la cuenta" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Contraseña de la cuenta" /></div>
      {msg && <p className="small" style={{ color: msg.startsWith('Te hemos') ? 'var(--good)' : 'var(--bad)' }}>{msg}</p>}
      <button className="btn primary block" disabled={busy || !email || password.length < 6}>{busy ? 'Un momento…' : mode === 'in' ? 'Iniciar sesión' : 'Crear cuenta'}</button>
      <p className="tiny muted center" style={{ marginBottom: 0 }}>La contraseña de la cuenta es distinta de la de cifrado: el servidor nunca ve esta última ni tus datos.</p>
    </form>
  );
}
