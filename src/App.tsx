import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/icons';
import { InstallBanner } from './components/Install';
import { QuickAdd } from './components/QuickAdd';
import { Toaster } from './components/ui';
import { VoiceSheet } from './components/Voice';
import { demoData } from './lib/demo';
import { emptyData } from './lib/defaults';
import { setMasked, today } from './lib/money';
import { supabase } from './lib/sync';
import { applySavedTheme } from './lib/theme';
import { IS_PREVIEW } from './lib/preview';
import { Assistant } from './pages/Assistant';
import { Currency } from './pages/Currency';
import { Groups } from './pages/Groups';
import { Health } from './pages/Health';
import { Home } from './pages/Home';
import { Plan } from './pages/Plan';
import { handleBankCallback, Settings } from './pages/Settings';
import { Subscriptions } from './pages/Subscriptions';
import { Transactions } from './pages/Transactions';
import { Wealth } from './pages/Wealth';
import { AuthForm, RecoveryNotice } from './components/AuthForm';
import { useStore } from './store';

export type Page = 'home' | 'transactions' | 'plan' | 'assistant' | 'more' | 'fx' | 'groups' | 'wealth' | 'health' | 'subs' | 'settings';

const TITLES: Record<Page, string> = {
  home: 'Inicio',
  transactions: 'Movimientos',
  plan: 'Plan',
  assistant: 'Asesor',
  more: 'Más',
  fx: 'Divisas',
  groups: 'Compartir',
  wealth: 'Patrimonio',
  health: 'Salud financiera',
  subs: 'Suscripciones',
  settings: 'Ajustes',
};

const TABS: [Page, string, string][] = [
  ['home', 'home', 'Inicio'],
  ['transactions', 'list', 'Movimientos'],
  ['plan', 'target', 'Plan'],
  ['assistant', 'sparkles', 'Asesor'],
  ['more', 'grid', 'Más'],
];

const MORE: [Page, string, string, string][] = [
  ['fx', 'swap', 'Divisas y cambios', 'Tasas BCV/paralelo, Wise, pérdidas por cambio'],
  ['groups', 'users', 'Gastos compartidos', 'Divide cuentas con amigos y familia'],
  ['wealth', 'chart', 'Patrimonio', 'Cuentas, inversiones, cripto y deudas'],
  ['health', 'heart', 'Salud financiera', 'Tu puntuación y consejos'],
  ['subs', 'repeat', 'Suscripciones y comisiones', 'Cobros recurrentes y fugas'],
  ['settings', 'gear', 'Ajustes', 'Apariencia, cuenta, datos y seguridad'],
];

const PARENT: Partial<Record<Page, Page>> = { fx: 'more', groups: 'more', wealth: 'more', health: 'more', subs: 'more', settings: 'more' };

applySavedTheme();

export function App() {
  const store = useStore();
  const [page, setPage] = useState<Page>(() => {
    const h = location.hash.slice(1) as Page;
    return h in TITLES ? h : 'home';
  });
  const [sheet, setSheet] = useState<'add' | 'voice' | null>(null);
  // "Ojito": oculta los importes en toda la app (se recuerda en este dispositivo).
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('finanzas.hide') === '1';
    } catch {
      return false;
    }
  });
  setMasked(hidden);
  const toggleHidden = () => {
    setHidden((h) => {
      try {
        localStorage.setItem('finanzas.hide', h ? '0' : '1');
      } catch {
        /* sin almacenamiento */
      }
      return !h;
    });
  };
  const callbackDone = useRef(false);

  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}#${page}`);
    window.scrollTo({ top: 0 });
  }, [page]);

  useEffect(() => {
    if (store.status === 'ready' && !callbackDone.current) {
      callbackDone.current = true;
      void handleBankCallback(store);
    }
  }, [store.status, store]);

  // Atajos del icono de la app (manifest shortcuts): ?accion=voz / ?accion=nuevo
  useEffect(() => {
    if (store.status !== 'ready') return;
    const a = new URLSearchParams(location.search).get('accion');
    if (a === 'voz') setSheet('voice');
    if (a === 'nuevo') setSheet('add');
  }, [store.status]);

  const ambient = (
    <div className="ambient" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );

  if (store.status === 'loading') return ambient;
  if (store.status !== 'ready') return (
    <>
      {ambient}
      <Lock />
      <Toaster />
    </>
  );

  const parent = PARENT[page];
  const tab = parent ?? page;
  return (
    <>
      {ambient}
      <div className="app">
        <header className="nav">
          {parent ? (
            <button className="back lg" onClick={() => setPage(parent)}>
              <Icon name="back" size={22} stroke={2.4} /> {TITLES[parent]}
            </button>
          ) : (
            <span />
          )}
          <div className="nav-actions">
            <button className="icon-btn lg" onClick={toggleHidden} aria-label={hidden ? 'Mostrar importes' : 'Ocultar importes'} aria-pressed={hidden} title={hidden ? 'Mostrar importes' : 'Ocultar importes'}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={19} />
            </button>
            {store.sync.status !== 'off' && (
              <button className="icon-btn lg" onClick={() => void store.syncNow()} aria-label="Sincronizar" title={store.sync.error ?? (store.sync.lastSync ? `Sincronizado ${new Date(store.sync.lastSync).toLocaleTimeString('es-ES')}` : 'Sincronizar')}>
                <Icon name="cloud" size={19} className={store.sync.status === 'syncing' ? 'spin' : ''} />
                {store.sync.status === 'error' && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, background: 'var(--bad)' }} />}
              </button>
            )}
            <button className="icon-btn lg" onClick={store.lock} aria-label="Bloquear">
              <Icon name="lock" size={19} />
            </button>
          </div>
        </header>
        <h1 className="large-title">{TITLES[page]}</h1>
        {page === 'home' && <InstallBanner />}

        <main>
          {page === 'home' && <Home go={setPage} openVoice={() => setSheet('voice')} openAdd={() => setSheet('add')} hidden={hidden} />}
          {page === 'transactions' && <Transactions />}
          {page === 'plan' && <Plan />}
          {page === 'assistant' && <Assistant />}
          {page === 'fx' && <Currency />}
          {page === 'groups' && <Groups />}
          {page === 'wealth' && <Wealth />}
          {page === 'health' && <Health />}
          {page === 'subs' && <Subscriptions />}
          {page === 'settings' && <Settings />}
          {page === 'more' && (
            <div className="card glass flush">
              <ul className="list">
                {MORE.map(([p, icon, label, hint]) => (
                  <li key={p} className="tap" onClick={() => setPage(p)}>
                    <span className="icon"><Icon name={icon} size={19} /></span>
                    <div className="grow">
                      <div>{label}</div>
                      <div className="small muted ellipsis">{hint}</div>
                    </div>
                    <Icon name="chevron" size={18} className="chev" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>

      <div className="dock">
        <div className="dock-inner">
          <nav className="tabbar lg" aria-label="Secciones">
            {TABS.map(([p, icon, label]) => (
              <button key={p} className={tab === p ? 'on' : ''} onClick={() => setPage(p)} aria-current={tab === p ? 'page' : undefined}>
                <Icon name={icon} size={23} stroke={tab === p ? 2.2 : 1.8} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <button className="fab lg tint" onClick={() => setSheet('add')} aria-label="Añadir movimiento" onContextMenu={(e) => { e.preventDefault(); setSheet('voice'); }}>
            <Icon name="plus" size={28} stroke={2.4} />
          </button>
        </div>
      </div>

      {sheet === 'add' && <QuickAdd onClose={() => setSheet(null)} onVoice={() => setSheet('voice')} />}
      {sheet === 'voice' && <VoiceSheet onClose={() => setSheet(null)} />}
      <Toaster />
    </>
  );
}

function Lock() {
  const store = useStore();
  const isNew = store.status === 'new';
  const [mode, setMode] = useState<'welcome' | 'pass' | 'restore'>(isNew && supabase() ? 'welcome' : 'pass');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState(store.sync.error ?? '');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void supabase()?.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      // Al volver de Google ya hay sesión: salta directo a la contraseña de cifrado.
      if (data.session) setMode((m) => (m === 'welcome' ? 'pass' : m));
    });
  }, [mode]);

  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    // Errores devueltos por Google/Supabase en la URL al volver del inicio de sesión.
    const q = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));
    const oauthError = q.get('error_description') ?? q.get('error');
    if (oauthError) setError(`No se pudo iniciar sesión: ${oauthError.replace(/\+/g, ' ')}`);
    const { data } = sb.auth.onAuthStateChange((ev, session) => {
      if (session && (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION')) {
        setSignedIn(true);
        setMode((m) => (m === 'welcome' ? 'pass' : m));
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (demo = false) => {
    setError('');
    if (isNew) {
      if (pass.length < 6) return setError('Usa al menos 6 caracteres.');
      if (pass !== pass2) return setError('Las contraseñas no coinciden.');
      setBusy(true);
      const initial = demo ? demoData(today()) : emptyData();
      // En la vista previa de claude.ai la IA funciona con tu cuenta de Claude.
      if (IS_PREVIEW) initial.settings = { ...initial.settings, offlineOnly: false };
      await store.create(pass, initial);
      if (signedIn) await store.linkCloud(pass).catch(() => undefined);
    } else {
      setBusy(true);
      if (!(await store.open(pass))) {
        setError('Contraseña incorrecta.');
        setBusy(false);
      }
    }
  };

  const restore = async () => {
    setBusy(true);
    setError('');
    const r = await store.restoreFromCloud(pass).catch((e: Error) => e.message);
    if (r === 'empty') setError('No hay datos en la nube para esta cuenta todavía.');
    else if (r === 'wrong-passphrase') setError('Esa no es la contraseña con la que cifraste tus datos.');
    else if (r !== 'ok') setError(String(r));
    setBusy(false);
  };

  if (mode === 'welcome') {
    return (
      <div className="lock">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <RecoveryNotice><></></RecoveryNotice>
          <div className="card lg">
            <div className="app-icon"><Icon name="wallet" size={38} /></div>
            <h1 className="center" style={{ margin: '4px 0 6px', fontSize: 30, letterSpacing: '-0.04em', fontFamily: 'var(--font-display)' }}>Finanzas</h1>
            <p className="small muted center" style={{ marginTop: 0 }}>Crea tu cuenta o inicia sesión para guardar tus datos y usarlos en todos tus dispositivos.</p>
            {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
            <AuthForm onDone={() => { setSignedIn(true); setMode('pass'); }} />
            <button className="btn ghost block mt small" onClick={() => setMode('pass')}>Usar sin cuenta, solo en este dispositivo</button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'restore') {
    return (
      <div className="lock">
        <div className="card lg">
          <div className="app-icon"><Icon name="cloud" size={36} /></div>
          <h1 className="center" style={{ margin: '4px 0 6px', fontSize: 26, letterSpacing: '-0.035em', fontFamily: 'var(--font-display)' }}>Recuperar mis datos</h1>
          <p className="small muted center" style={{ marginTop: 0 }}>Inicia sesión y escribe la contraseña de cifrado que usas en tu otro dispositivo.</p>
          {!signedIn ? (
            <AuthForm onDone={() => setSignedIn(true)} />
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void restore(); }}>
              <div className="field">
                <input type="password" autoFocus placeholder="Contraseña de cifrado" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Contraseña de cifrado" />
              </div>
              {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
              <button className="btn primary block" disabled={busy || !pass}>{busy ? 'Descifrando…' : 'Recuperar'}</button>
            </form>
          )}
          <button className="btn ghost block mt small" onClick={() => setMode('pass')}>Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lock">
      <div style={{ width: '100%', maxWidth: 400 }}>
      <RecoveryNotice><></></RecoveryNotice>
      <form className="card lg" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="app-icon"><Icon name="wallet" size={38} /></div>
        <h1 className="center" style={{ margin: '4px 0 6px', fontSize: 30, letterSpacing: '-0.04em', fontFamily: 'var(--font-display)' }}>Finanzas</h1>
        <p className="small muted center" style={{ marginTop: 0 }}>
          {isNew
            ? 'Crea una contraseña de cifrado. Protege tus datos y no se puede recuperar: guárdala bien.'
            : 'Introduce tu contraseña para descifrar tus datos.'}
        </p>
        <div className="field">
          <input type="password" autoFocus autoComplete={isNew ? 'new-password' : 'current-password'} placeholder="Contraseña" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Contraseña" />
        </div>
        {isNew && (
          <div className="field">
            <input type="password" autoComplete="new-password" placeholder="Repite la contraseña" value={pass2} onChange={(e) => setPass2(e.target.value)} aria-label="Repite la contraseña" />
          </div>
        )}
        {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
        <button className="btn primary block" disabled={busy || !pass}>{busy ? 'Un momento…' : isNew ? 'Empezar' : 'Desbloquear'}</button>
        {isNew && (
          <>
            <button type="button" className="btn tinted block mt" disabled={busy || !pass} onClick={() => void submit(true)}>
              Probar con datos de ejemplo
            </button>
            {supabase() && (
              <button type="button" className="btn ghost block mt small" onClick={() => setMode('restore')}>
                Ya tengo datos guardados en mi cuenta
              </button>
            )}
          </>
        )}
        {!isNew && (
          <button type="button" className="btn ghost block mt small muted" onClick={() => confirm('Se borrarán los datos cifrados de este dispositivo. ¿Continuar?') && void store.wipe()}>
            He olvidado la contraseña
          </button>
        )}
      </form>
      </div>
    </div>
  );
}
