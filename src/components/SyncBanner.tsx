import { useState } from 'react';
import type { Page } from '../App';
import { bioLabel } from '../lib/biometric';
import { getSupabaseConfig } from '../lib/sync';
import { useStore } from '../store';
import { Icon } from './icons';
import { toast } from './ui';
import { t as _t } from '../lib/i18n';

/**
 * Avisos de Inicio sobre la cuenta y la sincronización: sin sesión, sesión sin vincular,
 * clave distinta a la de la nube, errores. Siempre con una acción para resolverlo en el momento.
 */
export function SyncBanner({ go }: { go: (p: Page) => void }) {
  const store = useStore();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  if (!getSupabaseConfig()) return null;

  const wrongKey = store.sync.status === 'error' && /otra clave|otra contraseña/i.test(store.sync.error ?? '');

  const link = async () => {
    setBusy(true);
    try {
      const r = await store.linkCloud(pass);
      if (r === 'linked') {
        setPass('');
        toast(_t("Sincronización activada"));
      } else toast(_t("Esa clave no coincide con la de tus otros dispositivos."));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const useCloud = async () => {
    if (!confirm('Se reemplazarán los datos de este dispositivo por los de tu cuenta (antes se guarda una copia local). ¿Continuar?')) return;
    setBusy(true);
    const r = await store.restoreFromCloud(pass).catch((e: Error) => e.message);
    setBusy(false);
    if (r === 'ok') {
      setPass('');
      toast(_t("Datos de tu cuenta cargados"));
    } else toast(r === 'wrong-passphrase' ? 'Esa clave no abre los datos de tu cuenta.' : String(r));
  };

  if (!store.account) {
    return (
      <div className="card glass row" style={{ padding: 14 }}>
        <span className="icon accent"><Icon name="cloud" size={20} /></span>
        <div className="grow small"><b>{_t("Guarda tus datos en tu cuenta")}</b><div className="muted">{_t("Entra con Google y tendrás lo mismo en el móvil y en el ordenador.")}</div></div>
        <button className="btn primary sm" onClick={() => go('settings')}>{_t("Entrar")}</button>
      </div>
    );
  }

  if (store.sync.status === 'off' || wrongKey) {
    return (
      <div className="card glass" style={{ padding: 14 }}>
        <div className="row">
          <span className="icon accent"><Icon name="cloud" size={20} /></span>
          <div className="grow small">
            <b>{wrongKey ? _t("Tu cuenta tiene datos con otra clave") : _t("Activa la sincronización")}</b>
            <div className="muted">
              {wrongKey ? _t("Escribe la clave de cifrado que usas en tus otros dispositivos.") : `Sesión de ${store.account}. Escribe tu clave de cifrado una vez para unir este dispositivo.`}
            </div>
          </div>
        </div>
        <form className="row mt" onSubmit={(e) => { e.preventDefault(); void link(); }}>
          <input type="password" placeholder={_t("Clave de cifrado")} value={pass} onChange={(e) => setPass(e.target.value)} aria-label={_t("Clave de cifrado")} autoComplete="current-password" />
          <button className="btn primary" disabled={!pass || busy}>{busy ? '…' : _t("Unir")}</button>
        </form>
        {wrongKey && <button className="btn ghost block mt small" disabled={!pass || busy} onClick={() => void useCloud()}>{_t("Usar los datos de la nube en este dispositivo")}</button>}
      </div>
    );
  }

  if (store.sync.status === 'error') {
    return (
      <div className="card glass row" style={{ padding: 14 }}>
        <span className="icon" style={{ color: 'var(--bad)' }}><Icon name="alert" size={20} /></span>
        <div className="grow small"><b>{_t("No se pudo sincronizar")}</b><div className="muted">{store.sync.error}</div></div>
        <button className="btn sm" onClick={() => void store.syncNow()}>{_t("Reintentar")}</button>
      </div>
    );
  }
  return null;
}

/** Ofrece activar Face ID / huella (una sola vez por dispositivo). */
export function BiometricPrompt() {
  const store = useStore();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('finanzas.bio-asked') === '1';
    } catch {
      return false;
    }
  });
  if (hidden || !store.biometrics.available || store.biometrics.enabled) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem('finanzas.bio-asked', '1');
    } catch {
      /* ignorado */
    }
  };
  return (
    <div className="card glass row" style={{ padding: 14 }}>
      <span className="icon accent"><Icon name="shield" size={20} /></span>
      <div className="grow small"><b>{_t("Entra con")} {bioLabel()}</b><div className="muted">{_t("Sin escribir la clave cada vez. Tus datos siguen cifrados.")}</div></div>
      <button className="btn primary sm" onClick={async () => { const ok = await store.enableBiometrics(); toast(ok ? _t("Desbloqueo biométrico activado") : _t("No se pudo activar")); if (ok) close(); }}>{_t("Activar")}</button>
      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={close} aria-label={_t("Ahora no")}><Icon name="close" size={14} stroke={2.4} /></button>
    </div>
  );
}
