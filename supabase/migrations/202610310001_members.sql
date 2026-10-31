begin;
create table public.investment_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trade_date date not null,
  market text not null check (market in ('KR','US')),
  symbol text not null check (char_length(symbol) between 1 and 20),
  stock_name text not null check (char_length(stock_name) between 1 and 80),
  side text not null check (side in ('buy','sell')),
  quantity numeric(20,8) not null check (quantity>0 and quantity<1000000000000),
  price numeric(20,8) not null check (price>0 and price<1000000000000),
  reason text not null default '' check (char_length(reason)<=3000),
  review text not null default '' check (char_length(review)<=5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index investment_entries_owner_date on public.investment_entries(owner_id,trade_date desc);
alter table public.investment_entries enable row level security;
revoke all on public.investment_entries from anon, authenticated;
grant select,insert,update,delete on public.investment_entries to authenticated;
create policy entries_read_own on public.investment_entries for select to authenticated using ((select auth.uid())=owner_id);
create policy entries_insert_own on public.investment_entries for insert to authenticated with check ((select auth.uid())=owner_id);
create policy entries_update_own on public.investment_entries for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy entries_delete_own on public.investment_entries for delete to authenticated using ((select auth.uid())=owner_id);

create table public.investment_comments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 30),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index investment_comments_created on public.investment_comments(created_at desc);
create index investment_comments_owner_created on public.investment_comments(owner_id,created_at desc);
alter table public.investment_comments enable row level security;
revoke all on public.investment_comments from anon, authenticated;
grant select on public.investment_comments to anon, authenticated;
grant insert,delete on public.investment_comments to authenticated;
create policy comments_public_read on public.investment_comments for select to anon,authenticated using (true);
create policy comments_insert_own on public.investment_comments for insert to authenticated with check ((select auth.uid())=owner_id);
create policy comments_delete_own on public.investment_comments for delete to authenticated using ((select auth.uid())=owner_id);

create function public.prepare_investment_comment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if (select count(*) from public.investment_comments where owner_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then
    raise exception 'COMMENT_RATE_LIMIT';
  end if;
  new.created_at:=now();return new;
end; $$;
revoke all on function public.prepare_investment_comment() from public;
create trigger investment_comment_guard before insert on public.investment_comments for each row execute function public.prepare_investment_comment();

create function public.touch_investment_entry() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=now();return new;end; $$;
revoke all on function public.touch_investment_entry() from public;
create trigger investment_entry_touch before update on public.investment_entries for each row execute function public.touch_investment_entry();
commit;
