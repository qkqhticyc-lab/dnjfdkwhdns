alter table public.club_targets add column price_history jsonb not null default '[]'::jsonb check(jsonb_typeof(price_history)='array');
create or replace function public.record_club_observations(observations jsonb) returns void
language sql security invoker set search_path = '' as $$
 update public.club_targets t set
  price_history=case when o.price_history is not null and (t.checked_at is null or o.checked_at>=t.checked_at) then
   (select coalesce(jsonb_agg(p order by p->>'date'),'[]'::jsonb) from
    (select distinct on (e.p->>'date') e.p from jsonb_array_elements(t.price_history||o.price_history)with ordinality as e(p,n)
     where e.p->>'date'>=t.start_date::text and (e.p->>'close')::numeric>0 and (e.p->>'high')::numeric>0
     order by e.p->>'date',e.n desc) merged)
   else t.price_history end,
  quote=case when o.quote->>'asOf' is not null and (t.quote->>'asOf' is null or (o.quote->>'asOf')::timestamptz >= (t.quote->>'asOf')::timestamptz) then o.quote else t.quote end,
  checked_at=greatest(t.checked_at,o.checked_at), check_status=case when t.checked_at is null or o.checked_at>=t.checked_at then o.check_status else t.check_status end,
  history_complete=t.history_complete or coalesce(o.history_complete,false),
  history_from=least(t.history_from,o.history_from), history_through=greatest(t.history_through,o.history_through),
  hit_date=case when o.hit_date>=t.start_date and o.hit_high>=t.target_price and (t.hit_date is null or o.hit_date<t.hit_date) then o.hit_date else t.hit_date end,
  hit_high=case when o.hit_date>=t.start_date and o.hit_high>=t.target_price and (t.hit_date is null or o.hit_date<t.hit_date) then o.hit_high else t.hit_high end,
  peak_price=greatest(t.peak_price,o.peak_price),
  peak_date=case when o.peak_price is not null and (t.peak_price is null or o.peak_price>t.peak_price) then o.peak_date else t.peak_date end,
  source_url=coalesce(o.source_url,t.source_url)
 from jsonb_to_recordset(observations) as o(id text,target_price numeric,start_date date,quote jsonb,checked_at timestamptz,check_status text,history_complete boolean,history_from date,history_through date,hit_date date,hit_high numeric,peak_price numeric,peak_date date,source_url text,price_history jsonb)
 where t.id=o.id and t.target_price=o.target_price and t.start_date=o.start_date
;
$$;

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
