create table public.club_comments (
 id uuid primary key default gen_random_uuid(),
 target_id text not null references public.club_targets(id) on delete cascade,
 nickname text not null check(char_length(btrim(nickname)) between 1 and 30),
 body text not null check(char_length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index club_comments_target_created on public.club_comments(target_id,created_at desc,id desc);
alter table public.club_comments enable row level security;
revoke all on public.club_comments from public,anon,authenticated;
grant select on public.club_comments to anon,authenticated;
grant all on public.club_comments to service_role;
create policy club_comments_read on public.club_comments for select to anon,authenticated using(true);
create table private.club_comment_receipts (
 comment_id uuid primary key references public.club_comments(id) on delete cascade,
 delete_hash text not null check(delete_hash~'^[0-9a-f]{64}$')
);
alter table private.club_comment_receipts enable row level security;
revoke all on private.club_comment_receipts from public,anon,authenticated;
grant all on private.club_comment_receipts to service_role;
create policy club_receipts_service on private.club_comment_receipts for all to service_role using(true) with check(true);
create function public.create_club_comment(p_target text,p_nickname text,p_body text,p_client_hash text,p_delete_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare limits private.journal_guest_limits; new_id uuid;
begin
 if current_user<>'service_role' then raise exception 'Service only';end if;
 if p_target is null or p_nickname is null or p_body is null or p_client_hash is null or p_delete_hash is null or p_client_hash!~'^[0-9a-f]{64}$' or p_delete_hash!~'^[0-9a-f]{64}$' or char_length(btrim(p_nickname)) not between 1 and 30 or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'Invalid comment';end if;
 if not exists(select 1 from public.club_targets where id=p_target) then raise exception 'Unknown club target';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_hash,4));
 insert into private.journal_guest_limits values(p_client_hash,now(),0,now(),0,now())on conflict do nothing;
 select * into limits from private.journal_guest_limits where client_hash=p_client_hash;
 if limits.minute_at<now()-interval'1 minute' then limits.minute_at:=now();limits.minute_count:=0;end if;
 if limits.day_at<now()-interval'1 day' then limits.day_at:=now();limits.day_count:=0;end if;
 if limits.minute_count>=5 or limits.day_count>=50 then raise exception 'GUEST_RATE_LIMIT';end if;
 insert into public.club_comments(target_id,nickname,body)values(p_target,btrim(p_nickname),btrim(p_body))returning id into new_id;
 insert into private.club_comment_receipts values(new_id,p_delete_hash);
 update private.journal_guest_limits set minute_at=limits.minute_at,minute_count=limits.minute_count+1,day_at=limits.day_at,day_count=limits.day_count+1,last_at=now() where client_hash=p_client_hash;
 delete from private.journal_guest_limits where last_at<now()-interval'7 days';
 return new_id;
end;$$;
revoke all on function public.create_club_comment(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_club_comment(text,text,text,text,text) to service_role;
create function public.delete_club_comment(p_comment uuid,p_delete_hash text) returns boolean language plpgsql security invoker set search_path='' as $$
declare removed integer;
begin
 if current_user<>'service_role' then raise exception 'Service only';end if;
 delete from public.club_comments c where c.id=p_comment and exists(select 1 from private.club_comment_receipts r where r.comment_id=c.id and r.delete_hash=p_delete_hash);
 get diagnostics removed=row_count;return removed=1;
end;$$;
revoke all on function public.delete_club_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.delete_club_comment(uuid,text) to service_role;
