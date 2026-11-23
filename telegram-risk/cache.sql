-- Private last-good close, read/written only by the authenticated bot backend.
create table public.telegram_risk_close_cache (
 id text primary key check (id = 'close'),
 as_of date not null,
 report jsonb not null check (jsonb_typeof(report) = 'object'),
 updated_at timestamptz not null default now()
);
alter table public.telegram_risk_close_cache enable row level security;
revoke all on public.telegram_risk_close_cache from public, anon, authenticated;
grant select, insert, update on public.telegram_risk_close_cache to service_role;
create policy bot_backend_only on public.telegram_risk_close_cache
 for all to service_role using (true) with check (true);
create function public.save_telegram_risk_close(p_report jsonb)
returns void language sql security invoker set search_path = '' as $$
 insert into public.telegram_risk_close_cache(id,as_of,report)
 values ('close',(p_report->>'asOf')::date,p_report)
 on conflict (id) do update set as_of=excluded.as_of,report=excluded.report,updated_at=now()
 where excluded.as_of >= telegram_risk_close_cache.as_of;
$$;
revoke all on function public.save_telegram_risk_close(jsonb) from public, anon, authenticated;
grant execute on function public.save_telegram_risk_close(jsonb) to service_role;
