begin;
create table public.journal_site_settings (
 singleton boolean primary key default true check(singleton),
 owner_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.journal_site_settings enable row level security;
revoke all on public.journal_site_settings from anon,authenticated;
grant select on public.journal_site_settings to anon,authenticated;
grant all on public.journal_site_settings to service_role;
create policy journal_settings_read on public.journal_site_settings for select to anon,authenticated using(true);
-- The connected GitHub account's immutable provider identity, never editable user metadata.
insert into public.journal_site_settings(singleton,owner_id)
select true,user_id from auth.identities where provider='github' and provider_id='330951298';
do $$begin if(select count(*) from public.journal_site_settings)<>1 then raise exception 'Verified journal owner identity not found';end if;end$$;
alter table public.journal_posts add column board text not null default 'public' check(board in('featured','public'));
alter table public.journal_posts add column entry_price numeric(20,8) check(entry_price>0 and entry_price<1000000000000);
alter table public.journal_posts add constraint journal_entry_price_side check(entry_price is null or side='sell');
update public.journal_posts set board='featured' where owner_id=(select owner_id from public.journal_site_settings where singleton);
create index journal_posts_board_date on public.journal_posts(board,created_at desc);
grant insert(board,entry_price),update(entry_price) on public.journal_posts to authenticated;
drop policy posts_insert on public.journal_posts;
drop policy posts_update on public.journal_posts;
drop policy posts_delete on public.journal_posts;
create policy posts_insert on public.journal_posts for insert to authenticated with check(
 (select auth.uid())=owner_id and source='manual' and
 (board='public' or (board='featured' and (select auth.uid())=(select owner_id from public.journal_site_settings where singleton)))
);
create policy posts_update on public.journal_posts for update to authenticated using(
 (select auth.uid())=owner_id and (board='public' or (select auth.uid())=(select owner_id from public.journal_site_settings where singleton))
) with check(
 (select auth.uid())=owner_id and (board='public' or (select auth.uid())=(select owner_id from public.journal_site_settings where singleton))
);
create policy posts_delete on public.journal_posts for delete to authenticated using(
 (select auth.uid())=owner_id and (board='public' or (select auth.uid())=(select owner_id from public.journal_site_settings where singleton))
);
drop policy share_links_own on public.journal_share_links;
create policy share_links_own on public.journal_share_links for all to authenticated using(
 (select auth.uid())=owner_id and (select auth.uid())=(select owner_id from public.journal_site_settings where singleton)
) with check(
 (select auth.uid())=owner_id and (select auth.uid())=(select owner_id from public.journal_site_settings where singleton)
);
create function public.guard_journal_board() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.board='featured' and new.owner_id is distinct from(select owner_id from public.journal_site_settings where singleton) then raise exception 'Owner journal is reserved for the site owner';end if;
 if tg_op='UPDATE' and new.board<>old.board then raise exception 'Journal board cannot be changed';end if;
 return new;
end;$$;
revoke all on function public.guard_journal_board() from public,anon,authenticated;
create trigger journal_board_guard before insert or update on public.journal_posts for each row execute function public.guard_journal_board();
commit;
