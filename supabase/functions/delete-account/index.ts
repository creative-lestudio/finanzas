// Borrado de cuenta (derecho de supresión, RGPD). Elimina al usuario de Supabase
// Auth; sus datos (tabla `vaults` y `ai_usage`) se borran en cascada.
// Necesita SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (los inyecta Supabase).

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

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
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /, '');
  const { data } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!data.user) return json({ error: 'No has iniciado sesión.' }, 401);
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return json({ error: 'No se pudo borrar la cuenta.' }, 500);
  return json({ ok: true });
});
