import { useEffect, useState, type ReactNode } from 'react';
import { COACH } from './Coach';
import { Icon } from './icons';
import { t as _t } from '../lib/i18n';

interface Slide {
  title: string;
  text: ReactNode;
  viz: ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: _t("Bienvenido a Finanzas"),
    text: _t("Soy tu asistente. Te voy a enseñar la app en un minuto y luego haremos juntos tres tareas para que empieces bien: tus cuentas, un movimiento y un presupuesto."),
    viz: (
      <>
        <div className="tv-logo"><Icon name="wallet" size={34} /></div>
        <div className="tv-chips"><span>{_t("Registrar")}</span><span>{_t("Planificar")}</span><span>{_t("Entender")}</span></div>
      </>
    ),
  },
  {
    title: _t("Registrar es lo más rápido"),
    text: (
      <>
        {_t("Con el botón")} <b>+</b> {_t("añades un gasto o un ingreso. O toca")} <b>{_t("Dictar")}</b> {_t("y dilo con tu voz: yo reconozco el importe, la moneda y el comercio.")}
      </>
    ),
    viz: (
      <>
        <div className="tv-say">{_t("«Gasté 50 euros en Mercadona»")}</div>
        <div className="tv-wave" aria-hidden>{Array.from({ length: 13 }, (_, k) => <i key={k} style={{ animationDelay: `${-(k % 5) * 0.2}s` }} />)}</div>
        <div className="tv-fab"><Icon name="plus" size={26} stroke={2.2} /></div>
      </>
    ),
  },
  {
    title: _t("Global: tu posición"),
    text: (
      <>
        {_t("En")} <b>{_t("Global")}</b> {_t("ves tu patrimonio y lo que gastas este mes. Desliza la tarjeta azul para ver saldo e inversiones. El")} <b>{_t("ojito")}</b> {_t("oculta los importes cuando alguien mira. En")} <b>{_t("Cuentas")}</b> {_t("están tus saldos y en")} <b>{_t("Movimientos")}</b>{_t(", todo lo que has registrado con su resumen.")}
      </>
    ),
    viz: (
      <div className="tv-balance">
        <div className="tv-eye"><Icon name="eye" size={16} /></div>
        <small>{_t("Patrimonio neto")}</small>
        <b>13.106,44 €</b>
        <div className="tv-dots"><i className="on" /><i /><i /></div>
      </div>
    ),
  },
  {
    title: _t("Planea: presupuestos y metas"),
    text: (
      <>
        {_t("En")} <b>{_t("Planea")}</b> {_t("fijas topes por categoría y metas con fecha. Te aviso")} <b>{_t("antes")}</b> {_t("de que te pases y te digo si vas en camino.")}
      </>
    ),
    viz: (
      <div className="tv-bars">
        <div><span>{_t("Supermercado")}</span><span>248 / 320 €</span><i style={{ ['--w' as string]: '78%', ['--c' as string]: 'var(--warn)' }} /></div>
        <div><span>{_t("Transporte")}</span><span>41 / 120 €</span><i style={{ ['--w' as string]: '34%', ['--c' as string]: 'var(--good)' }} /></div>
        <div><span>{_t("Meta: viaje")}</span><span>62 %</span><i style={{ ['--w' as string]: '62%', ['--c' as string]: 'var(--support)' }} /></div>
      </div>
    ),
  },
  {
    title: _t("Bolívares y otras monedas"),
    text: (
      <>
        {_t("Al registrar un pago en Bs, indica la")} <b>{_t("tasa")}</b> {_t("(BCV, Paralelo, Euro o acordada) o el monto en dólares: la app lo cuenta en tu moneda principal. Las tasas oficiales del día se descargan solas; las ves en")} <b>{_t("Ajustes → Más herramientas → Divisas")}</b>.
      </>
    ),
    viz: (
      <div className="tv-fx">
        <div className="tv-eq"><b>{_t("1.100.000 Bs")}</b><Icon name="swap" size={20} /><b>1.250 $</b></div>
        <div className="tv-chips"><span>{_t("BCV")}</span><span>{_t("Paralelo")}</span><span>{_t("Euro")}</span><span className="on">{_t("Acordada")}</span></div>
      </div>
    ),
  },
  {
    title: _t("Asesoría y seguridad"),
    text: _t("En Asesoría puedes preguntarme sobre tus números. Todo se cifra en tu dispositivo; con tu cuenta, tus datos te siguen cifrados entre dispositivos."),
    viz: (
      <div className="tv-sec">
        <span><Icon name="lock" size={30} /></span>
        <b>{_t("AES-256")}</b>
        <span><Icon name="cloud" size={30} /></span>
      </div>
    ),
  },
  {
    title: _t("Vamos con tus 3 tareas"),
    text: (
      <>
        {_t("Ahora lo hacemos juntos:")} <b>1.</b> {_t("configurar tus cuentas y saldos,")} <b>2.</b> {_t("registrar un movimiento y")} <b>3.</b> {_t("planificar un presupuesto. Lo que hagas de prueba lo borro al terminar.")}
      </>
    ),
    viz: (
      <div className="tv-bars">
        <div><span>{_t("1 · Cuentas y saldos")}</span><span>›</span><i style={{ ['--w' as string]: '100%', ['--c' as string]: 'var(--good)' }} /></div>
        <div><span>{_t("2 · Un movimiento")}</span><span>›</span><i style={{ ['--w' as string]: '66%', ['--c' as string]: 'var(--support)' }} /></div>
        <div><span>{_t("3 · Un presupuesto")}</span><span>›</span><i style={{ ['--w' as string]: '33%', ['--c' as string]: 'var(--warn)' }} /></div>
      </div>
    ),
  },
];

/** Recorrido de primer uso presentado por el asistente: pantallas cortas con lo esencial. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, SLIDES.length - 1));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="tour-bg" role="dialog" aria-modal aria-label={_t("Recorrido de la app")}>
      <div className="tour">
        <button className="tour-skip" onClick={onClose}>{_t("Saltar")}</button>
        <div className="tour-viz" key={i}>{s.viz}</div>
        <div className="tour-coach">
          <img src={COACH.hola} alt="" />
          <div className="bubble"><b>{s.title}</b>{s.text}</div>
        </div>
        <div className="tour-pager" aria-hidden>{SLIDES.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)} style={{ visibility: i === 0 ? 'hidden' : 'visible' }}>{_t("Atrás")}</button>
          <button className="btn primary grow" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? _t("Empezar las tareas") : _t("Siguiente")}</button>
        </div>
        <div className="tiny muted center" style={{ marginTop: 10 }}>{i + 1} {_t("de")} {SLIDES.length} {_t("· Puedes volver a verlo en Ajustes")}</div>
      </div>
    </div>
  );
}
