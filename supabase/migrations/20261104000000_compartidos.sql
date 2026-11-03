-- Gastos compartidos y deudas entre usuarios (p. ej. «Hogar» con tu pareja).
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor.
--
-- Importante: estos datos NO van cifrados de extremo a extremo (hay que poder mostrárselos a los
-- demás miembros). Los ve únicamente quien pertenece al grupo (RLS) y el servidor. Tus datos
-- personales siguen cifrados solo para ti.

create table if not exists public.shared_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  currency text not null default 'USD' check (char_length(currency) between 2 and 8),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_members (
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.shared_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  email text not null check (email = lower(email)),
  invited_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

-- kind: 'expense' (gasto pagado por `payer` y repartido en `shares`), 'debt' (deuda directa)
-- o 'payment' (liquidación). En los tres casos: `payer` puso el dinero y `shares` dice quién lo debe.
create table if not exists public.shared_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.shared_groups (id) on delete cascade,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null default 'expense' check (kind in ('expense', 'debt', 'payment')),
  payer uuid not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  description text not null default '' check (char_length(description) <= 200),
  entry_date date not null default current_date,
  shares jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_entries_group_idx on public.shared_entries (group_id, entry_date desc);
create index if not exists shared_members_user_idx on public.shared_members (user_id);

-- ¿El usuario actual pertenece al grupo? (security definer: evita recursión en las políticas)
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.shared_members m where m.group_id = gid and m.user_id = (select auth.uid()));
$$;

alter table public.shared_groups enable row level security;
alter table public.shared_members enable row level security;
alter table public.shared_invites enable row level security;
alter table public.shared_entries enable row level security;

-- Grupos: los ven y renombran sus miembros (la creación va por create_shared_group).
drop policy if exists "grupo: ver miembros" on public.shared_groups;
create policy "grupo: ver miembros" on public.shared_groups for select to authenticated using (public.is_group_member(id));
drop policy if exists "grupo: renombrar el creador" on public.shared_groups;
create policy "grupo: renombrar el creador" on public.shared_groups for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
drop policy if exists "grupo: borrar el creador" on public.shared_groups;
create policy "grupo: borrar el creador" on public.shared_groups for delete to authenticated using (created_by = (select auth.uid()));

-- Miembros: los ven los del grupo; cada uno puede salir o cambiar su nombre; el creador puede quitar a otros.
drop policy if exists "miembros: ver" on public.shared_members;
create policy "miembros: ver" on public.shared_members for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "miembros: cambiar mi nombre" on public.shared_members;
create policy "miembros: cambiar mi nombre" on public.shared_members for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "miembros: salir o quitar" on public.shared_members;
create policy "miembros: salir o quitar" on public.shared_members for delete to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.shared_groups g where g.id = group_id and g.created_by = (select auth.uid())));

-- Invitaciones: las crean y ven los miembros; el invitado ve las dirigidas a su correo.
drop policy if exists "invitaciones: ver" on public.shared_invites;
create policy "invitaciones: ver" on public.shared_invites for select to authenticated
  using (public.is_group_member(group_id) or email = lower((select auth.jwt() ->> 'email')));
drop policy if exists "invitaciones: crear" on public.shared_invites;
create policy "invitaciones: crear" on public.shared_invites for insert to authenticated
  with check (public.is_group_member(group_id) and invited_by = (select auth.uid()));
drop policy if exists "invitaciones: borrar" on public.shared_invites;
create policy "invitaciones: borrar" on public.shared_invites for delete to authenticated
  using (public.is_group_member(group_id) or email = lower((select auth.jwt() ->> 'email')));

-- Movimientos del grupo: los ven y crean los miembros; solo quien los creó puede editarlos o borrarlos.
drop policy if exists "movimientos: ver" on public.shared_entries;
create policy "movimientos: ver" on public.shared_entries for select to authenticated using (public.is_group_member(group_id));
drop policy if exists "movimientos: crear" on public.shared_entries;
create policy "movimientos: crear" on public.shared_entries for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = (select auth.uid())
    and exists (select 1 from public.shared_members m where m.group_id = shared_entries.group_id and m.user_id = shared_entries.payer));
drop policy if exists "movimientos: editar los propios" on public.shared_entries;
create policy "movimientos: editar los propios" on public.shared_entries for update to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(group_id))
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id)
    and exists (select 1 from public.shared_members m where m.group_id = shared_entries.group_id and m.user_id = shared_entries.payer));
drop policy if exists "movimientos: borrar los propios" on public.shared_entries;
create policy "movimientos: borrar los propios" on public.shared_entries for delete to authenticated
  using (created_by = (select auth.uid()) and public.is_group_member(group_id));

revoke all on public.shared_groups, public.shared_members, public.shared_invites, public.shared_entries from anon;
grant select, update, delete on public.shared_groups to authenticated;
grant select, update, delete on public.shared_members to authenticated;
grant select, insert, delete on public.shared_invites to authenticated;
grant select, insert, update, delete on public.shared_entries to authenticated;

-- Crear un grupo: el creador entra como primer miembro.
create or replace function public.create_shared_group(p_name text, p_currency text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  gid uuid;
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.' using errcode = '28000'; end if;
  insert into public.shared_groups (name, currency, created_by) values (trim(p_name), upper(coalesce(nullif(trim(p_currency), ''), 'USD')), uid) returning id into gid;
  insert into public.shared_members (group_id, user_id, email, display_name)
  values (gid, uid, lower((select auth.jwt() ->> 'email')), left(coalesce(nullif(trim(p_display_name), ''), split_part(lower((select auth.jwt() ->> 'email')), '@', 1)), 60));
  return gid;
end;
$$;

-- Invitaciones pendientes del usuario actual (con el nombre del grupo, que aún no puede leer).
create or replace function public.my_pending_invites()
returns table (group_id uuid, group_name text, invited_by_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.group_id, g.name,
         coalesce((select m.display_name from public.shared_members m where m.group_id = i.group_id and m.user_id = i.invited_by), 'Alguien')
  from public.shared_invites i
  join public.shared_groups g on g.id = i.group_id
  where i.email = lower((select auth.jwt() ->> 'email'));
$$;

-- Aceptar una invitación dirigida al correo del usuario actual.
create or replace function public.accept_invite(p_group uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mail text := lower((select auth.jwt() ->> 'email'));
begin
  if uid is null then raise exception 'Necesitas iniciar sesión.' using errcode = '28000'; end if;
  if not exists (select 1 from public.shared_invites where group_id = p_group and email = mail) then
    raise exception 'No hay una invitación para tu correo en este grupo.' using errcode = '42501';
  end if;
  insert into public.shared_members (group_id, user_id, email, display_name)
  values (p_group, uid, mail, left(coalesce(nullif(trim(p_display_name), ''), split_part(mail, '@', 1)), 60))
  on conflict (group_id, user_id) do nothing;
  delete from public.shared_invites where group_id = p_group and email = mail;
end;
$$;

revoke all on function public.create_shared_group(text, text, text), public.my_pending_invites(), public.accept_invite(uuid, text), public.is_group_member(uuid) from public, anon;
grant execute on function public.create_shared_group(text, text, text), public.my_pending_invites(), public.accept_invite(uuid, text), public.is_group_member(uuid) to authenticated;

-- Cambios en vivo para los miembros.
do $$ begin
  alter publication supabase_realtime add table public.shared_entries;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.shared_members;
exception when duplicate_object then null; when undefined_object then null; end $$;
