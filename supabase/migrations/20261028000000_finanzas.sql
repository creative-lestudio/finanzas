-- Finanzas: sincronización cifrada de extremo a extremo + control de uso de IA.

-- Una fila por usuario con su "bóveda": un blob cifrado en el dispositivo
-- con la contraseña del usuario (AES-256-GCM). El servidor no puede leerlo.
create table if not exists public.vaults (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  blob jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  -- Tope de tamaño por bóveda (10 MB de JSON cifrado): evita abusos de almacenamiento.
  constraint vault_size check (pg_column_size(blob) < 10485760)
);

alter table public.vaults enable row level security;

-- Sin sesión (rol anon) no hay acceso a nada; con sesión, solo a la propia fila.
revoke all on public.vaults from anon;
grant select, insert, update, delete on public.vaults to authenticated;

drop policy if exists "vault: solo el dueño" on public.vaults;
create policy "vault: solo el dueño" on public.vaults
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Avisos en tiempo real cuando otro dispositivo sube cambios.
do $$
begin
  alter publication supabase_realtime add table public.vaults;
exception when duplicate_object then null;
end $$;

-- Límite diario de peticiones al asistente de IA por usuario.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage: ver el propio" on public.ai_usage;
create policy "ai_usage: ver el propio" on public.ai_usage
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.bump_ai_usage(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c integer;
begin
  insert into public.ai_usage (user_id, day, count)
  values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into c;
  return c;
end;
$$;

-- Solo la función de servidor (service_role) puede contar usos.
revoke execute on function public.bump_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid) to service_role;
grant select, insert, update on public.ai_usage to service_role;
