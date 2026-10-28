import { useEffect, useRef, useState } from 'react';
import { QuickAdd } from './components/QuickAdd';
import { Toaster } from './components/ui';
import { demoData } from './lib/demo';
import { emptyData } from './lib/defaults';
import { today } from './lib/money';
import { Groups } from './pages/Groups';
import { Health } from './pages/Health';
import { Home } from './pages/Home';
import { Plan } from './pages/Plan';
import { handleBankCallback, Settings } from './pages/Settings';
import { Subscriptions } from './pages/Subscriptions';
import { Transactions } from './pages/Transactions';
import { Wealth } from './pages/Wealth';
import { useStore } from './store';

export type Page = 'home' | 'transactions' | 'plan' | 'groups' | 'more' | 'wealth' | 'health' | 'subs' | 'settings';

const TITLES: Record<Page, string> = {
  home: 'Inicio',
  transactions: 'Movimientos',
  plan: 'Plan',
  groups: 'Gastos compartidos',
  more: 'Más',
  wealth: 'Patrimonio',
  health: 'Salud financiera',
  subs: 'Suscripciones y comisiones',
  settings: 'Ajustes',
};

const TABS: [Page, string, string][] = [
  ['home', '🏠', 'Inicio'],
  ['transactions', '📋', 'Movimientos'],
  ['plan', '🎯', 'Plan'],
  ['groups', '👥', 'Compartir'],
  ['more', '☰', 'Más'],
];

const MORE: [Page, string, string][] = [
  ['wealth', '📊', 'Patrimonio: cuentas, inversiones, cripto y deudas'],
  ['health', '❤️', 'Salud financiera y consejos'],
  ['subs', '🔁', 'Suscripciones y comisiones'],
  ['settings', '⚙️', 'Ajustes, seguridad, banco e importación'],
];

const PARENT: Partial<Record<Page, Page>> = { wealth: 'more', health: 'more', subs: 'more', settings: 'more' };

export function App() {
  const store = useStore();
  const [page, setPage] = useState<Page>(() => (location.hash.slice(1) as Page) in TITLES ? (location.hash.slice(1) as Page) : 'home');
  const [adding, setAdding] = useState(false);
  const callbackDone = useRef(false);

  useEffect(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}#${page}`);
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    if (store.status === 'ready' && !callbackDone.current) {
      callbackDone.current = true;
      void handleBankCallback(store);
    }
  }, [store.status, store]);

  if (store.status === 'loading') return null;
  if (store.status !== 'ready') return <Lock />;

  const tab = PARENT[page] ?? page;
  return (
    <div className="app">
      <header className="topbar">
        {PARENT[page] ? (
          <button className="btn ghost" onClick={() => setPage(PARENT[page]!)} aria-label="Volver">‹ {TITLES[PARENT[page]!]}</button>
        ) : (
          <h1>{TITLES[page]}</h1>
        )}
        <button className="btn ghost" onClick={store.lock} aria-label="Bloquear">🔒</button>
      </header>
      {PARENT[page] && <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>{TITLES[page]}</h1>}

      <main>
        {page === 'home' && <Home go={setPage} />}
        {page === 'transactions' && <Transactions />}
        {page === 'plan' && <Plan />}
        {page === 'groups' && <Groups />}
        {page === 'wealth' && <Wealth />}
        {page === 'health' && <Health />}
        {page === 'subs' && <Subscriptions />}
        {page === 'settings' && <Settings />}
        {page === 'more' && (
          <div className="card" style={{ padding: '4px 16px' }}>
            <ul className="list">
              {MORE.map(([p, icon, label]) => (
                <li key={p} onClick={() => setPage(p)} style={{ cursor: 'pointer' }}>
                  <span className="icon">{icon}</span>
                  <span className="grow">{label}</span>
                  <span className="muted">›</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {(page === 'home' || page === 'transactions') && (
        <button className="fab" onClick={() => setAdding(true)} aria-label="Añadir movimiento">+</button>
      )}
      {adding && <QuickAdd onClose={() => setAdding(false)} />}

      <div className="tabbar">
        <nav>
          {TABS.map(([p, icon, label]) => (
            <button key={p} className={tab === p ? 'on' : ''} onClick={() => setPage(p)} aria-current={tab === p ? 'page' : undefined}>
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      <Toaster />
    </div>
  );
}

function Lock() {
  const store = useStore();
  const isNew = store.status === 'new';
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (demo = false) => {
    setError('');
    if (isNew) {
      if (pass.length < 6) return setError('Usa al menos 6 caracteres.');
      if (pass !== pass2) return setError('Las contraseñas no coinciden.');
      setBusy(true);
      await store.create(pass, demo ? demoData(today()) : emptyData());
    } else {
      setBusy(true);
      if (!(await store.open(pass))) {
        setError('Contraseña incorrecta.');
        setBusy(false);
      }
    }
  };

  return (
    <div className="lock">
      <form className="card" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div style={{ textAlign: 'center', fontSize: 44 }}>💶</div>
        <h1 style={{ textAlign: 'center', margin: '4px 0 6px', fontSize: 22 }}>Finanzas</h1>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 0 }}>
          {isNew
            ? 'Crea una contraseña. Cifra tus datos en este dispositivo y no se puede recuperar: guárdala bien.'
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
          <button type="button" className="btn block" style={{ marginTop: 8 }} disabled={busy || !pass} onClick={() => void submit(true)}>
            Empezar con datos de ejemplo
          </button>
        )}
        {!isNew && (
          <button type="button" className="btn ghost block small muted" style={{ marginTop: 8 }} onClick={() => confirm('Se borrarán los datos cifrados de este dispositivo. ¿Continuar?') && store.wipe()}>
            He olvidado la contraseña
          </button>
        )}
      </form>
    </div>
  );
}
