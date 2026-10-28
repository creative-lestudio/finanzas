// Asistente de IA de Finanzas — Supabase Edge Function (Deno).
//
// Llama a Claude con la clave del servicio para los usuarios que han
// iniciado sesión, con un límite diario por usuario. Secretos necesarios:
//   ANTHROPIC_API_KEY   clave de la API de Anthropic (console.anthropic.com)
//   AI_DAILY_LIMIT      peticiones por usuario y día (opcional, 60 por defecto)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const MODEL = 'claude-opus-5-5';
const LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 60);

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'El servicio de IA aún no está configurado.' }, 503);

  const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '');
  const { data: auth } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!auth.user) return json({ error: 'Inicia sesión para usar el asistente.' }, 401);

  const { data: used, error: usageError } = await admin.rpc('bump_ai_usage', { p_user: auth.user.id });
  if (usageError) return json({ error: 'No se pudo comprobar el límite de uso.' }, 500);
  if ((used as number) > LIMIT) return json({ error: `Has llegado al límite de ${LIMIT} consultas de hoy. Vuelve mañana.` }, 429);

  let body: {
    system: string;
    messages: Anthropic.Beta.BetaMessageParam[];
    tools?: Anthropic.Beta.BetaTool[];
    schema?: Record<string, unknown>;
    effort?: 'low' | 'medium' | 'high';
    maxTokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Petición no válida' }, 400);
  }
  if (!body?.system || !Array.isArray(body.messages) || JSON.stringify(body).length > 400_000) {
    return json({ error: 'Petición no válida' }, 400);
  }

  try {
    const message = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: Math.min(body.maxTokens ?? 16000, 16000),
      system: body.system,
      messages: body.messages,
      tools: body.tools,
      output_config: {
        effort: ['low', 'medium', 'high'].includes(body.effort ?? '') ? body.effort : 'medium',
        ...(body.schema ? { format: { type: 'json_schema', schema: body.schema } } : {}),
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return json(message);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'La IA está saturada. Prueba en un minuto.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `Error de la IA (${e.status}).` }, 502);
    return json({ error: 'Error inesperado del asistente.' }, 500);
  }
});
