-- Herramientas de cuenta para el usuario autenticado.
-- Ejecuta este archivo UNA vez en Supabase → SQL Editor (o con `supabase db push`).

-- Borrado de la propia cuenta: elimina el usuario (y, por cascada, su bóveda y su contador de IA).
-- Es "security definer" para poder tocar auth.users, pero solo actúa sobre auth.uid(): nadie puede
-- borrar la cuenta de otra persona.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Necesitas iniciar sesión.' using errcode = '28000';
  end if;
  delete from public.vaults where user_id = uid;
  delete from public.ai_usage where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
