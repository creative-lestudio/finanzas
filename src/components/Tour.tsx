import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icons';

interface Slide {
  title: string;
  text: ReactNode;
  viz: ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: 'Bienvenido a Finanzas',
    text: 'Un minuto para conocer lo esencial. Tu dinero, con claridad, en tu móvil y bajo tu control.',
    viz: (
      <>
        <div className="tv-logo"><Icon name="wallet" size={34} /></div>
        <div className="tv-chips"><span>Registrar</span><span>Planificar</span><span>Entender</span></div>
      </>
    ),
  },
  {
    title: 'Registra en segundos',
    text: (
      <>
        Toca <b>+</b> para añadir un gasto o un ingreso. O toca <b>Dictar</b> y dilo con tu voz: la app reconoce importe, moneda y comercio.
      </>
    ),
    viz: (
      <>
        <div className="tv-say">«Gasté 50 euros en Mercadona»</div>
        <div className="tv-wave" aria-hidden>{Array.from({ length: 13 }, (_, k) => <i key={k} style={{ animationDelay: `${-(k % 5) * 0.2}s` }} />)}</div>
        <div className="tv-fab"><Icon name="plus" size={26} stroke={2.2} /></div>
      </>
    ),
  },
  {
    title: 'Tu mes de un vistazo',
    text: (
      <>
        En <b>Inicio</b> ves tu patrimonio y lo que gastas. Desliza la tarjeta azul para ver saldo e inversiones. El <b>ojito</b> oculta los importes cuando alguien mira.
      </>
    ),
    viz: (
      <div className="tv-balance">
        <div className="tv-eye"><Icon name="eye" size={16} /></div>
        <small>Patrimonio neto</small>
        <b>13.106,44 €</b>
        <div className="tv-dots"><i className="on" /><i /><i /></div>
      </div>
    ),
  },
  {
    title: 'Presupuestos y metas',
    text: (
      <>
        En <b>Plan</b> fijas topes por categoría y metas con fecha. La app te avisa <b>antes</b> de pasarte y te dice si vas en camino.
      </>
    ),
    viz: (
      <div className="tv-bars">
        <div><span>Supermercado</span><span>248 / 320 €</span><i style={{ ['--w' as string]: '78%', ['--c' as string]: 'var(--warn)' }} /></div>
        <div><span>Transporte</span><span>41 / 120 €</span><i style={{ ['--w' as string]: '34%', ['--c' as string]: 'var(--good)' }} /></div>
        <div><span>Meta: viaje</span><span>62 %</span><i style={{ ['--w' as string]: '62%', ['--c' as string]: 'var(--support)' }} /></div>
      </div>
    ),
  },
  {
    title: 'Bolívares y otras monedas',
    text: (
      <>
        Al registrar un pago en Bs, indica la <b>tasa</b> (BCV, Paralelo, Euro o acordada) o el monto en dólares: la app lo cuenta en tu moneda principal. Anota las tasas del día en <b>Más → Divisas</b>.
      </>
    ),
    viz: (
      <div className="tv-fx">
        <div className="tv-eq"><b>56.500 Bs</b><Icon name="swap" size={20} /><b>1.250 $</b></div>
        <div className="tv-chips"><span>BCV</span><span>Paralelo</span><span>Euro</span><span className="on">Acordada</span></div>
      </div>
    ),
  },
  {
    title: 'Asesor y seguridad',
    text: 'Pregúntale al Asesor sobre tus números. Todo se cifra en tu dispositivo; con tu cuenta, tus datos te siguen cifrados entre dispositivos.',
    viz: (
      <div className="tv-sec">
        <span><Icon name="lock" size={30} /></span>
        <b>AES-256</b>
        <span><Icon name="cloud" size={30} /></span>
      </div>
    ),
  },
];

/** Recorrido de primer uso: seis pantallas cortas con lo esencial. */
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
    <div className="tour-bg" role="dialog" aria-modal aria-label="Recorrido de la app">
      <div className="tour">
        <button className="tour-skip" onClick={onClose}>Saltar</button>
        <div className="tour-viz" key={i}>{s.viz}</div>
        <h2>{s.title}</h2>
        <p>{s.text}</p>
        <div className="tour-pager" aria-hidden>{SLIDES.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)} style={{ visibility: i === 0 ? 'hidden' : 'visible' }}>Atrás</button>
          <button className="btn primary grow" onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Empezar' : 'Siguiente'}</button>
        </div>
        <div className="tiny muted center" style={{ marginTop: 10 }}>{i + 1} de {SLIDES.length} · Puedes volver a verlo en Ajustes</div>
      </div>
    </div>
  );
}
