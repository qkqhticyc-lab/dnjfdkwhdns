-- Managed Supabase scheduler setup (pg_cron / pg_net / Vault).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.screener_watchdog_state (
 key text primary key check (key='latest'), payload jsonb not null
);
create table if not exists public.screener_watchdog_leases (
 action text primary key check (action in ('scan','publish')), expires_at timestamptz not null
);
alter table public.screener_watchdog_state enable row level security;
alter table public.screener_watchdog_leases enable row level security;
revoke all on public.screener_watchdog_state, public.screener_watchdog_leases from public,anon,authenticated;
grant all on public.screener_watchdog_state, public.screener_watchdog_leases to service_role;
create policy service_only on public.screener_watchdog_state to service_role using (true) with check (true);
create policy service_only on public.screener_watchdog_leases to service_role using (true) with check (true);

do $$ begin
 if not exists (select 1 from vault.secrets where name='screener_watchdog_key') then
  perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'screener_watchdog_key','Private authentication for the screener scheduler');
 end if;
end $$;
-- Deliberately bounded Vault access: only the server role can read this one scheduler key.
create or replace function public.screener_watchdog_key() returns text
language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='screener_watchdog_key' limit 1;
$$;
revoke all on function public.screener_watchdog_key() from public,anon,authenticated;
grant execute on function public.screener_watchdog_key() to service_role;

create or replace function public.claim_screener_watchdog(p_action text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare claimed boolean;
begin
 insert into public.screener_watchdog_leases(action,expires_at) values (p_action,now()+interval '30 minutes')
 on conflict (action) do update set expires_at=excluded.expires_at
 where public.screener_watchdog_leases.expires_at < now()
 returning true into claimed;
 return coalesce(claimed,false);
end $$;
revoke all on function public.claim_screener_watchdog(text) from public,anon,authenticated;
grant execute on function public.claim_screener_watchdog(text) to service_role;

-- Sign in the database so pg_net never stores the permanent key in its request queue.
create or replace function public.invoke_screener_watchdog(p_force boolean default false) returns bigint
language plpgsql security definer set search_path='' as $$
declare sent_at text:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 signing_key text;
begin
 select decrypted_secret into signing_key from vault.decrypted_secrets where name='screener_watchdog_key';
 return net.http_post(
  url:='https://lrmevhhdfmpnclomhsmz.supabase.co/functions/v1/screener-watchdog',
  headers:=jsonb_build_object('Content-Type','application/json','x-screener-watchdog-at',sent_at,
   'x-screener-watchdog-signature',encode(extensions.hmac(sent_at||'.'||case when p_force then 'force' else 'scheduled' end,signing_key,'sha256'),'hex')),
  body:=jsonb_build_object('force',p_force),timeout_milliseconds:=60000
 );
end $$;
revoke all on function public.invoke_screener_watchdog(boolean) from public,anon,authenticated;
select cron.schedule('screener-close-watchdog','*/10 * * * *','select public.invoke_screener_watchdog();');
