import acompana from '../assets/coach/acompana.webp';
import analiza from '../assets/coach/analiza.webp';
import complice from '../assets/coach/complice.webp';
import curioso from '../assets/coach/curioso.webp';
import explica from '../assets/coach/explica.webp';
import feliz from '../assets/coach/feliz.webp';
import hola from '../assets/coach/hola.webp';
import insights from '../assets/coach/insights.webp';
import motiva from '../assets/coach/motiva.webp';
import pensando from '../assets/coach/pensando.webp';
import seguro from '../assets/coach/seguro.webp';
import type { CoachPose } from '../lib/coach';

// El personaje del asistente: un chico cercano con sudadera azul marino.
// Cada pose acompaña un momento (saludar, pensar, explicar, celebrar...).
export const COACH: Record<CoachPose, string> = { acompana, analiza, complice, curioso, explica, feliz, hola, insights, motiva, pensando, seguro };

export function CoachAvatar({ pose = 'seguro', size = 36 }: { pose?: CoachPose; size?: number }) {
  return <img className="coach-avatar" src={COACH[pose]} alt="" width={size} height={size} style={{ width: size, height: size }} />;
}
