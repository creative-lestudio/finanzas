import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/icons';
import { InstallBanner } from './components/Install';
import { Tour } from './components/Tour';
import { Debts } from './pages/Debts';
import { Learn } from './pages/Learn';
import { prefillFromUrl, type Prefill } from './lib/shortcut';
import { consumeWidgetAdd } from './lib/native';
import { pushWidget } from './lib/widget';
import { finishGuide, guideActive, guideComplete, newGuide } from './lib/guide';
import { Accounts } from './pages/Accounts';
import { bioLabel } from './lib/biometric';
import { QuickAdd } from './components/QuickAdd';
import { Toaster, toast } from './components/ui';
import { VoiceSheet } from './components/Voice';
import { demoData } from './lib/demo';
import { emptyData } from './lib/defaults';
import { setMasked, today } from './lib/money';
import { fetchRemote, supabase } from './lib/sync';
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
import { t as _t, LOCALE } from './lib/i18n';

export type Page = 'home' | 'transactions' | 'plan' | 'assistant' | 'more' | 'accounts' | 'debts' | 'learn' | 'fx' | 'groups' | 'wealth' | 'health' | 'subs' | 'settings';

const TITLES: Record<Page, string> = {
  home: 'Posición global',
  transactions: 'Movimientos',
  plan: 'Presupuesto',
  assistant: 'Asesor IA',
  more: 'Herramientas',
  accounts: 'Cuentas',
  debts: 'Deudas',
  learn: 'Aprende',
  fx: 'Divisas',
  groups: 'Compartir',
  wealth: 'Patrimonio',
  health: 'Salud financiera',
  subs: 'Suscripciones',
  settings: 'Ajustes',
};

const TABS: [Page, string, string][] = [
  ['home', 'home', 'Global'],
  ['accounts', 'bank', 'Cuentas'],
  ['transactions', 'list', 'Movimientos'],
  ['plan', 'target', 'Planea'],
  ['assistant', 'sparkles', 'Asesoría'],
  ['settings', 'gear', 'Ajustes'],
];

const MORE: [Page, string, string, string][] = [
  ['learn', 'book', 'Aprende', 'Lecciones de 3 minutos con tus números'],
  ['debts', 'scale', 'Deudas', 'Lo que debo y lo que me deben, con plan de pago'],
  ['fx', 'swap', 'Divisas y cambios', 'Tasas BCV/paralelo, Wise, pérdidas por cambio'],
  ['groups', 'users', 'Gastos compartidos', 'Divide cuentas con amigos y familia'],
  ['wealth', 'chart', 'Patrimonio', 'Cuentas, inversiones, cripto y deudas'],
  ['health', 'heart', 'Salud financiera', 'Tu puntuación y consejos'],
  ['subs', 'repeat', 'Suscripciones y comisiones', 'Cobros recurrentes y fugas'],
];

const PARENT: Partial<Record<Page, Page>> = { learn: 'more', debts: 'more', fx: 'more', groups: 'more', wealth: 'more', health: 'more', subs: 'more' };

applySavedTheme();

export function App() {
  const store = useStore();
  const [page, setPage] = useState<Page>(() => {
    const h = location.hash.slice(1) as Page;
    return h in TITLES ? h : 'home';
  });
  const [sheet, setSheet] = useState<'add' | 'voice' | null>(null);
  const [prefill, setPrefill] = useState<Prefill | undefined>();
  // Recorrido de primer uso: se muestra una vez (tras el asistente inicial) y se puede repetir desde Ajustes.
  const [tour, setTour] = useState(false);
  // Cuenta a mostrar en Movimientos cuando se llega desde la página de Cuentas.
  const [txAccount, setTxAccount] = useState<string | undefined>();
  useEffect(() => {
    if (page !== 'transactions') setTxAccount(undefined);
  }, [page]);
  const d0 = store.data as typeof store.data | null;
  useEffect(() => {
    if (d0 && !d0.settings.tourDone && !d0.settings.guide && !IS_PREVIEW) setTour(true);
  }, [!!d0, d0?.settings.tourDone, d0?.settings.guide?.step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const open = () => setTour(true);
    window.addEventListener('finanzas:tour', open);
    return () => window.removeEventListener('finanzas:tour', open);
  }, []);
  const closeTour = () => {
    setTour(false);
    if (!store.data) return;
    if (!store.data.settings.tourDone || store.data.settings.guide?.step === 'tour') {
      store.update((d) => ({ ...d, settings: { ...d.settings, tourDone: true, guide: d.settings.guide?.step === 'done' ? d.settings.guide : { ...(d.settings.guide ?? newGuide()), step: d.transactions.length > 0 ? 'done' : 'tasks' } } }));
    }
  };
  // Al completar las tres tareas se cierra la guía y se eliminan los datos de prueba.
  useEffect(() => {
    const g = d0?.settings.guide;
    if (!d0 || !guideComplete(g)) return;
    const hadTests = (g?.testTx.length ?? 0) + (g?.testBudgets.length ?? 0) > 0;
    store.update((d) => finishGuide(d));
    toast(hadTests ? '¡Listo! Ya conoces lo básico. Eliminé lo que hiciste de prueba.' : '¡Listo! Ya conoces lo básico de Finanzas.');
  }, [d0?.settings.guide]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Widget de inicio: el botón «+» abre «Nuevo movimiento»; si la app estaba bloqueada, se abre al desbloquear.
  useEffect(() => {
    const open = () => store.status === 'ready' && consumeWidgetAdd() && setSheet('add');
    open();
    window.addEventListener('finanzas:add', open);
    return () => window.removeEventListener('finanzas:add', open);
  }, [store.status]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resumen para el widget (solo con permiso del usuario; ver lib/widget.ts).
  useEffect(() => {
    if (store.status !== 'ready' || !store.data) return;
    const id = window.setTimeout(() => void pushWidget(store.data), 1500);
    return () => window.clearTimeout(id);
  }, [store.status, store.data]);

  // Atajos del icono de la app (manifest shortcuts): ?accion=voz / ?accion=nuevo
  useEffect(() => {
    if (store.status !== 'ready') return;
    const a = new URLSearchParams(location.search).get('accion');
    if (a === 'voz') setSheet('voice');
    const pre = prefillFromUrl(location.search);
    if (pre) {
      setPrefill(pre);
      setSheet('add');
    }
    if (a) history.replaceState(null, '', location.pathname + location.hash);
  }, [store.status]);

  const ambient = (
    <div className="ambient" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );

  if (store.status === 'loading') return ambient;
  if (store.status === 'error') return (
    <>
      {ambient}
      <div className="lock">
        <div className="card lg" style={{ maxWidth: 400 }}>
          <div className="app-icon"><Icon name="lock" size={36} /></div>
          <h1 className="center" style={{ margin: '4px 0 6px', fontSize: 24, fontFamily: 'var(--font-display)' }}>{_t("No puedo leer tus datos")}</h1>
          <p className="small muted center">{_t("El navegador no responde al leer el almacenamiento de este dispositivo.")} <b>{_t("Tus datos no se han borrado")}</b>{_t(": es un fallo temporal. Por seguridad no te dejo crear una cuenta nueva encima.")}</p>
          <button className="btn primary block" onClick={() => location.reload()}>{_t("Reintentar")}</button>
        </div>
      </div>
    </>
  );
  if (store.status !== 'ready') return (
    <>
      {ambient}
      <Lock />
      <Toaster />
    </>
  );

  const parent = PARENT[page];
  const tab = page === 'more' || parent ? 'settings' : page;
  return (
    <>
      {ambient}
      <div className="app">
        <header className="nav">
          {parent ? (
            <button className="back lg" onClick={() => setPage(parent)}>
              <Icon name="back" size={22} stroke={2.4} /> {_t(TITLES[parent])}
            </button>
          ) : page === 'more' ? (
            <button className="back lg" onClick={() => setPage('settings')}>
              <Icon name="back" size={22} stroke={2.4} /> {_t(TITLES.settings)}
            </button>
          ) : (
            <span />
          )}
          <div className="nav-actions">
            <button className="icon-btn lg" onClick={toggleHidden} aria-label={hidden ? _t("Mostrar importes") : _t("Ocultar importes")} aria-pressed={hidden} title={hidden ? _t("Mostrar importes") : _t("Ocultar importes")}>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={19} />
            </button>
            {store.sync.status !== 'off' && (
              <button className="icon-btn lg" onClick={() => void store.syncNow()} aria-label={_t("Sincronizar")} title={store.sync.error ?? (store.sync.lastSync ? `Sincronizado ${new Date(store.sync.lastSync).toLocaleTimeString(LOCALE)}` : _t("Sincronizar"))}>
                <Icon name="cloud" size={19} className={store.sync.status === 'syncing' ? 'spin' : ''} />
                {store.sync.status === 'error' && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, background: 'var(--bad)' }} />}
              </button>
            )}
            <button className="icon-btn lg" onClick={store.lock} aria-label={_t("Bloquear")}>
              <Icon name="lock" size={19} />
            </button>
          </div>
        </header>
        <h1 className="large-title">{_t(TITLES[page])}</h1>
        {page === 'home' && !(store.data && guideActive(store.data)) && <InstallBanner />}

        <main>
          {page === 'home' && <Home go={setPage} openVoice={() => setSheet('voice')} openAdd={() => setSheet('add')} hidden={hidden} />}
          {page === 'transactions' && <Transactions account={txAccount} />}
          {page === 'accounts' && <Accounts onView={(id) => { setTxAccount(id); setPage('transactions'); }} onAdd={() => setSheet('add')} />}
          {page === 'plan' && <Plan />}
          {page === 'assistant' && <Assistant />}
          {page === 'debts' && <Debts />}
          {page === 'learn' && <Learn go={setPage} />}
          {page === 'fx' && <Currency />}
          {page === 'groups' && <Groups go={setPage} />}
          {page === 'wealth' && <Wealth />}
          {page === 'health' && <Health />}
          {page === 'subs' && <Subscriptions />}
          {page === 'settings' && <Settings go={setPage} />}
          {page === 'more' && (
            <div className="card glass flush">
              <ul className="list">
                {MORE.map(([p, icon, label, hint]) => (
                  <li key={p} className="tap" onClick={() => setPage(p)}>
                    <span className="icon"><Icon name={icon} size={19} /></span>
                    <div className="grow">
                      <div>{_t(label)}</div>
                      <div className="small muted ellipsis">{_t(hint)}</div>
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
          <nav className="tabbar lg" aria-label={_t("Secciones")}>
            {TABS.map(([p, icon, label]) => (
              <button key={p} className={tab === p ? 'on' : ''} onClick={() => setPage(p)} aria-current={tab === p ? 'page' : undefined}>
                <Icon name={icon} size={23} stroke={tab === p ? 2.2 : 1.8} />
                <span>{_t(label)}</span>
              </button>
            ))}
          </nav>
          <button className="fab lg tint" onClick={() => setSheet('add')} aria-label={_t("Añadir movimiento")} onContextMenu={(e) => { e.preventDefault(); setSheet('voice'); }}>
            <Icon name="plus" size={28} stroke={2.4} />
          </button>
        </div>
      </div>

      {store.save.status === 'error' && (
        <div role="alert" className="card" style={{ position: 'fixed', top: 'max(8px, env(safe-area-inset-top))', left: 12, right: 12, zIndex: 200, color: 'var(--bad)' }}>
          {_t("No se pudo guardar en este dispositivo:")} {store.save.error} {_t("Reintentando… Descarga un Excel por si acaso.")}
        </div>
      )}
      {sheet === 'add' && <QuickAdd prefill={prefill} onClose={() => { setSheet(null); setPrefill(undefined); }} onVoice={() => setSheet('voice')} />}
      {sheet === 'voice' && <VoiceSheet onClose={() => setSheet(null)} />}
      {tour && <Tour onClose={closeTour} />}
      <Toaster />
    </>
  );
}

/** El desbloqueo biométrico se ofrece solo en el primer arranque de la sesión. */
let autoBio = true;

function LockHero({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="lock-hero">
      <div className="app-icon"><Icon name="wallet" size={34} /></div>
      <h1>{title}</h1>
      <p>{sub}</p>
    </div>
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
  const [found, setFound] = useState(false);
  const bioReady = !isNew && store.biometrics.enabled;
  const tryBio = async () => {
    setError('');
    setBusy(true);
    const ok = await store.openWithBiometrics();
    setBusy(false);
    if (!ok) setError(`No se pudo desbloquear con ${bioLabel()}. Usa tu clave de cifrado.`);
  };
  useEffect(() => {
    // Solo al abrir la app (no tras bloquear a mano o por inactividad): algunos navegadores piden un toque y queda el botón.
    const first = autoBio;
    autoBio = false;
    if (first && bioReady) void store.openWithBiometrics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void supabase()?.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      if (data.session) void afterSignIn();
    });
  }, [mode]);

  // Con sesión iniciada: si la cuenta ya tiene datos en la nube se recuperan (nunca se crea
  // una bóveda vacía encima); si no, se crea la clave de cifrado.
  const afterSignIn = async () => {
    const sb = supabase();
    if (!sb || !isNew) return;
    try {
      const remote = await fetchRemote(sb);
      setMode((m) => (m === 'welcome' || m === 'pass' ? (remote ? 'restore' : 'pass') : m));
      if (remote) setFound(true);
    } catch {
      setMode((m) => (m === 'welcome' ? 'pass' : m));
    }
  };

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
        void afterSignIn();
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
          <LockHero title={_t("Tu dinero, con claridad.")} sub={_t("Gastos, presupuestos y metas en bolívares, dólares y euros. Privada y cifrada.")} />
          <RecoveryNotice><></></RecoveryNotice>
          <div className="card lock-card">
            <p className="small muted center" style={{ marginTop: 0 }}>{_t("Crea tu cuenta o inicia sesión para guardar tus datos y usarlos en todos tus dispositivos.")}</p>
            {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
            <AuthForm onDone={() => { setSignedIn(true); void afterSignIn(); }} />
            <button className="btn ghost block mt small" onClick={() => setMode('pass')}>{_t("Usar sin cuenta, solo en este dispositivo")}</button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'restore') {
    return (
      <div className="lock">
        <div style={{ width: '100%', maxWidth: 400 }}>
        <div className="card lock-card">
          <div className="app-icon"><Icon name="cloud" size={36} /></div>
          <h1 className="center" style={{ margin: '4px 0 6px', fontSize: 26, letterSpacing: '-0.035em', fontFamily: 'var(--font-display)' }}>{_t("Recuperar mis datos")}</h1>
          <p className="small muted center" style={{ marginTop: 0 }}>{found ? _t("Hemos encontrado tus datos en la nube. Escribe tu clave de cifrado para abrirlos.") : _t("Inicia sesión y escribe la clave de cifrado que usas en tu otro dispositivo.")}</p>
          {!signedIn ? (
            <AuthForm onDone={() => setSignedIn(true)} />
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void restore(); }}>
              <div className="field">
                <input type="password" autoFocus placeholder={_t("Clave de cifrado")} value={pass} onChange={(e) => setPass(e.target.value)} aria-label={_t("Clave de cifrado")} />
              </div>
              {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
              <button className="btn primary block" disabled={busy || !pass}>{busy ? _t("Descifrando…") : _t("Recuperar")}</button>
            </form>
          )}
          <button className="btn ghost block mt small" onClick={() => setMode('pass')}>{_t("Volver")}</button>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lock">
      <div style={{ width: '100%', maxWidth: 400 }}>
      <LockHero title={isNew ? _t('Tu dinero, con claridad.') : _t('Hola de nuevo')} sub={isNew ? _t('Gastos, presupuestos y metas en bolívares, dólares y euros. Privada y cifrada.') : bioReady ? _t('Usa {bio} o tu clave de cifrado.', { bio: bioLabel() }) : _t('Introduce tu clave de cifrado para abrir tus datos.')} />
      <RecoveryNotice><></></RecoveryNotice>
      <form className="card lock-card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {bioReady && (
          <>
            <button type="button" className="btn primary block" disabled={busy} onClick={() => void tryBio()}>
              <Icon name="shield" size={18} /> {_t("Desbloquear con")} {bioLabel()}
            </button>
            <div className="row tiny muted" style={{ margin: '14px 0' }}><hr style={{ flex: 1, border: 0, borderTop: '0.5px solid var(--hairline)' }} />{_t("o con tu clave")}<hr style={{ flex: 1, border: 0, borderTop: '0.5px solid var(--hairline)' }} /></div>
          </>
        )}
        {isNew && <p className="small muted center" style={{ marginTop: 0 }}>{_t("Crea tu clave de cifrado. Protege tus datos y no se puede recuperar: guárdala bien. Solo se pide una vez en cada dispositivo; después puedes entrar con Face ID o huella.")}</p>}
        <div className="field">
          <input type="password" autoFocus autoComplete={isNew ? 'new-password' : 'current-password'} placeholder={_t("Contraseña")} value={pass} onChange={(e) => setPass(e.target.value)} aria-label={_t("Contraseña")} />
        </div>
        {isNew && (
          <div className="field">
            <input type="password" autoComplete="new-password" placeholder={_t("Repite la contraseña")} value={pass2} onChange={(e) => setPass2(e.target.value)} aria-label={_t("Repite la contraseña")} />
          </div>
        )}
        {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
        <button className="btn primary block" disabled={busy || !pass}>{busy ? _t("Un momento…") : isNew ? _t("Empezar") : _t("Desbloquear")}</button>
        {isNew && (
          <>
            <button type="button" className="btn tinted block mt" disabled={busy || !pass} onClick={() => void submit(true)}>
              {_t("Probar con datos de ejemplo")}
            </button>
            {supabase() && (
              <button type="button" className="btn ghost block mt small" onClick={() => setMode('restore')}>
                {_t("Ya tengo datos guardados en mi cuenta")}
              </button>
            )}
          </>
        )}
        {!isNew && (
          <button type="button" className="btn ghost block mt small muted" onClick={() => confirm('Se borrarán los datos cifrados de este dispositivo. ¿Continuar?') && void store.wipe()}>
            {_t("He olvidado la contraseña")}
          </button>
        )}
      </form>
      </div>
    </div>
  );
}
