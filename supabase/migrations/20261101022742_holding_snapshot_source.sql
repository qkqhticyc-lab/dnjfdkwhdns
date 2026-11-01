begin;
alter table public.journal_posts drop constraint journal_posts_source_check;
alter table public.journal_posts add constraint journal_posts_source_check check(source in('manual','account','holding'));
create or replace function public.guard_journal_board()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if(new.board='featured'or new.source='holding')and new.owner_id is distinct from(select owner_id from public.journal_site_settings where singleton)then raise exception 'Owner journal is reserved for the site owner';end if;
 if new.source='holding'and(new.board<>'featured'or new.side<>'buy')then raise exception 'Holding snapshots belong to the owner holding journal';end if;
 if tg_op='UPDATE'and new.board<>old.board then raise exception 'Journal board cannot be changed';end if;
 return new;
end;$$;
revoke all on function public.guard_journal_board()from public,anon,authenticated;
commit;
