// Vista previa publicada en claude.ai: la IA usa la cuenta de Claude de
// quien la abre (capacidad `sample` del artefacto) en lugar de una clave
// de API. Solo existe en el build de vista previa (VITE_PREVIEW=1).

export const IS_PREVIEW = import.meta.env.VITE_PREVIEW === '1';

export interface SampleTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute(input: Record<string, unknown>): unknown;
}

type Turn = { role: 'user' | 'assistant'; content: string };

export interface SampleFn {
  (input: string | Turn[], opts?: { tools?: SampleTool[]; cache?: boolean; modelTier?: 'quick' | 'default' | 'complex' }): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string | Turn[], opts?: { modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }): Promise<T>;
}

let samplePromise: Promise<SampleFn | null> | null = null;

export function getSample(): Promise<SampleFn | null> {
  if (!IS_PREVIEW) return Promise.resolve(null);
  const c = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!c?.use) return Promise.resolve(null);
  samplePromise ??= c.use('sample') as Promise<SampleFn | null>;
  return samplePromise;
}

export const hasClaudeHost = () => IS_PREVIEW && Boolean((window as unknown as { claude?: unknown }).claude);

const MESSAGES: Record<string, string> = {
  not_granted: 'No has permitido que esta vista previa use Claude.',
  sampling_disabled: 'Claude no está disponible para tu cuenta.',
  rate_limited: 'Demasiadas consultas seguidas. Prueba en un rato.',
  session_expired: 'Vuelve a iniciar sesión en claude.ai.',
  invalid_json: 'La respuesta no tenía el formato esperado. Inténtalo de nuevo.',
  refused: 'Claude no ha podido responder a esa petición.',
};

/** Traduce los errores de `sample` a un mensaje para el usuario. */
export function sampleError(e: unknown): Error {
  const code = (e as { code?: string })?.code;
  return new Error(MESSAGES[code ?? ''] ?? 'La IA no está disponible ahora mismo.');
}
