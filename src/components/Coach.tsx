import avatar from '../assets/coach/avatar.webp';
import type { CoachPose } from '../lib/coach';

// La imagen del asistente: un robot blanco con visor azul, sobre fondo marino
// (cabeza y hombros, saludando). Hay una sola imagen; la "pose" se mantiene en
// la lógica por si en el futuro hay más expresiones.
export const COACH: Record<CoachPose, string> = new Proxy({} as Record<CoachPose, string>, { get: () => avatar });

export function CoachAvatar({ size = 36 }: { pose?: CoachPose; size?: number }) {
  return <img className="coach-avatar" src={avatar} alt="" width={size} height={size} style={{ width: size, height: size }} />;
}
