import { useEffect, useState } from 'react';
import { Icon } from './icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
});

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Invita a instalar la app en la pantalla de inicio (Android/escritorio: botón; iPhone: instrucciones). */
export function InstallBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('finanzas.install-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [canPrompt, setCanPrompt] = useState(Boolean(deferred));

  useEffect(() => {
    const on = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  if (dismissed || standalone() || window.self !== window.top || (!canPrompt && !isIOS())) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem('finanzas.install-dismissed', '1');
    } catch {
      /* ignorado */
    }
  };

  return (
    <div className="card glass row" style={{ padding: 14 }}>
      <span className="icon accent"><Icon name="download" size={20} /></span>
      <div className="grow small">
        <b>Instala Finanzas</b>
        <div className="muted">
          {canPrompt ? 'Úsala como una app: a pantalla completa y sin conexión.' : <>En Safari pulsa <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>.</>}
        </div>
      </div>
      {canPrompt && (
        <button
          className="btn primary sm"
          onClick={async () => {
            await deferred?.prompt();
            deferred = null;
            close();
          }}
        >
          Instalar
        </button>
      )}
      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={close} aria-label="Cerrar"><Icon name="close" size={14} stroke={2.4} /></button>
    </div>
  );
}
