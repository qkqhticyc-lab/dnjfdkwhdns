begin;
create table public.journal_share_links (
 owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 nickname text not null check(char_length(btrim(nickname)) between 1 and 30),
 enabled boolean not null default true, created_at timestamptz not null default now()
);
alter table public.journal_share_links enable row level security;
revoke all on public.journal_share_links from anon,authenticated;
grant select,insert,update,delete on public.journal_share_links to authenticated;
create policy share_links_own on public.journal_share_links for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create table public.journal_posts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 nickname text not null check(char_length(btrim(nickname)) between 1 and 30),
 trade_date date not null, market text not null check(market in ('KR','US')),
 symbol text not null check(char_length(symbol) between 1 and 20),stock_name text not null check(char_length(stock_name) between 1 and 80),
 side text not null check(side in ('buy','sell')),reason text not null default '' check(char_length(reason)<=3000),review text not null default '' check(char_length(review)<=5000),
 source text not null default 'manual' check(source in ('manual','account')),external_id text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,external_id)
);
create index journal_posts_date on public.journal_posts(created_at desc);
alter table public.journal_posts enable row level security;
revoke all on public.journal_posts from anon,authenticated;
grant select on public.journal_posts to anon,authenticated;
grant insert(nickname,trade_date,market,symbol,stock_name,side,reason,review) on public.journal_posts to authenticated;
grant update(nickname,trade_date,market,symbol,stock_name,side,reason,review) on public.journal_posts to authenticated;
grant delete on public.journal_posts to authenticated;
create policy posts_read on public.journal_posts for select to anon,authenticated using (true);
create policy posts_insert on public.journal_posts for insert to authenticated with check ((select auth.uid())=owner_id and source='manual');
create policy posts_update on public.journal_posts for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy posts_delete on public.journal_posts for delete to authenticated using ((select auth.uid())=owner_id);
create trigger journal_posts_touch before update on public.journal_posts for each row execute function public.touch_investment_entry();
create table public.journal_post_comments (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.journal_posts(id) on delete cascade,
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 nickname text not null check(char_length(btrim(nickname)) between 1 and 30),body text not null check(char_length(btrim(body)) between 1 and 2000),created_at timestamptz not null default now()
);
create index post_comments_post_date on public.journal_post_comments(post_id,created_at);
create index post_comments_owner_date on public.journal_post_comments(owner_id,created_at);
alter table public.journal_post_comments enable row level security;
revoke all on public.journal_post_comments from anon,authenticated;
grant select on public.journal_post_comments to anon,authenticated;
grant insert(post_id,nickname,body) on public.journal_post_comments to authenticated;
grant delete on public.journal_post_comments to authenticated;
create policy post_comments_read on public.journal_post_comments for select to anon,authenticated using (true);
create policy post_comments_insert on public.journal_post_comments for insert to authenticated with check ((select auth.uid())=owner_id);
create policy post_comments_delete on public.journal_post_comments for delete to authenticated using ((select auth.uid())=owner_id);
create function public.guard_post_comment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 if (select count(*) from public.journal_post_comments where owner_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise exception 'COMMENT_RATE_LIMIT';end if;
 new.created_at:=now();return new;
end;$$;
revoke all on function public.guard_post_comment() from public;
create trigger post_comment_guard before insert on public.journal_post_comments for each row execute function public.guard_post_comment();
create table public.journal_share_suppressions(owner_id uuid not null references auth.users(id) on delete cascade,external_id text not null,primary key(owner_id,external_id));
alter table public.journal_share_suppressions enable row level security;
revoke all on public.journal_share_suppressions from anon,authenticated;
create schema if not exists private;
create function private.suppress_deleted_journal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and auth.uid()<>old.owner_id then raise exception 'Not authorized';end if;
 if old.source='account' and old.external_id is not null then insert into public.journal_share_suppressions(owner_id,external_id) values(old.owner_id,old.external_id) on conflict do nothing;end if;
 return old;
end;$$;
revoke all on function private.suppress_deleted_journal() from public,anon,authenticated;
create trigger journal_delete_suppression after delete on public.journal_posts for each row execute function private.suppress_deleted_journal();
grant all on public.journal_share_links,public.journal_posts,public.journal_post_comments,public.journal_share_suppressions to service_role;
commit;
