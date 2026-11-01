begin;
alter table public.journal_post_comments alter column owner_id drop not null;
alter table public.journal_post_comments add column is_guest boolean not null default false;
alter table public.journal_post_comments add constraint journal_comment_identity check((is_guest and owner_id is null)or(not is_guest and owner_id is not null));
create table private.journal_guest_limits(client_hash text primary key check(client_hash~'^[0-9a-f]{64}$'),minute_at timestamptz not null,minute_count integer not null,day_at timestamptz not null,day_count integer not null,last_at timestamptz not null);
create index journal_guest_limits_last on private.journal_guest_limits(last_at);
create table private.journal_guest_receipts(comment_id uuid primary key references public.journal_post_comments(id)on delete cascade,delete_hash text not null check(delete_hash~'^[0-9a-f]{64}$'));
alter table private.journal_guest_limits enable row level security;
alter table private.journal_guest_receipts enable row level security;
revoke all on private.journal_guest_limits,private.journal_guest_receipts from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.journal_guest_limits,private.journal_guest_receipts to service_role;
create or replace function public.guard_post_comment() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.is_guest then
  if current_user<>'service_role' or new.owner_id is not null then raise exception 'Guest endpoint required';end if;
 else
  if auth.uid()is null or new.owner_id<>auth.uid()then raise exception 'Authentication required';end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  if(select count(*)from public.journal_post_comments where owner_id=auth.uid()and created_at>now()-interval'1 minute')>=5 then raise exception 'COMMENT_RATE_LIMIT';end if;
 end if;
 new.created_at:=now();return new;
end;$$;
revoke all on function public.guard_post_comment() from public,anon,authenticated;
create policy owner_moderates_guest on public.journal_post_comments for delete to authenticated using(is_guest and(select auth.uid())=(select owner_id from public.journal_site_settings where singleton));
create function public.create_guest_journal_comment(p_post uuid,p_nickname text,p_body text,p_client_hash text,p_delete_hash text)returns uuid language plpgsql security invoker set search_path='' as $$
declare limits private.journal_guest_limits;new_id uuid;
begin
 if current_user<>'service_role' then raise exception 'Service only';end if;
 if p_post is null or p_client_hash is null or p_delete_hash is null or p_nickname is null or p_body is null or p_client_hash!~'^[0-9a-f]{64}$'or p_delete_hash!~'^[0-9a-f]{64}$'or char_length(btrim(p_nickname))not between 1 and 30 or char_length(btrim(p_body))not between 1 and 2000 then raise exception 'Invalid comment';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_hash,4));
 insert into private.journal_guest_limits values(p_client_hash,now(),0,now(),0,now())on conflict do nothing;
 select*into limits from private.journal_guest_limits where client_hash=p_client_hash;
 if limits.minute_at<now()-interval'1 minute' then limits.minute_at:=now();limits.minute_count:=0;end if;
 if limits.day_at<now()-interval'1 day' then limits.day_at:=now();limits.day_count:=0;end if;
 if limits.minute_count>=5 or limits.day_count>=50 then raise exception 'GUEST_RATE_LIMIT';end if;
 insert into public.journal_post_comments(post_id,owner_id,nickname,body,is_guest)values(p_post,null,btrim(p_nickname),btrim(p_body),true)returning id into new_id;
 insert into private.journal_guest_receipts values(new_id,p_delete_hash);
 update private.journal_guest_limits set minute_at=limits.minute_at,minute_count=limits.minute_count+1,day_at=limits.day_at,day_count=limits.day_count+1,last_at=now()where client_hash=p_client_hash;
 delete from private.journal_guest_limits where last_at<now()-interval'7 days';
 return new_id;
end;$$;
revoke all on function public.create_guest_journal_comment(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_guest_journal_comment(uuid,text,text,text,text)to service_role;
create function public.delete_guest_journal_comment(p_comment uuid,p_delete_hash text)returns boolean language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if current_user<>'service_role' then raise exception 'Service only';end if;
 delete from public.journal_post_comments c where c.id=p_comment and c.is_guest and exists(select 1 from private.journal_guest_receipts r where r.comment_id=c.id and r.delete_hash=p_delete_hash);
 get diagnostics removed=row_count;return removed=1;
end;$$;
revoke all on function public.delete_guest_journal_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.delete_guest_journal_comment(uuid,text)to service_role;
commit;
