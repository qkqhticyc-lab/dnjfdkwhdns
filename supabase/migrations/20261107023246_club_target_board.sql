create table public.club_targets (
 id text primary key, round smallint not null check (round between 1 and 3),
 person text not null, name text not null, market text not null check(market in ('KR','US')),
 symbol text not null, currency text not null check(currency in ('KRW','USD')),
 target_price numeric not null check(target_price>0), start_date date not null, note text,
 quote jsonb, checked_at timestamptz, check_status text not null default 'pending' check(check_status in ('pending','ok','partial','unavailable')),
 history_complete boolean not null default false, history_from date, history_through date,
 hit_date date, hit_high numeric, peak_price numeric, peak_date date, source_url text,
 check ((hit_date is null and hit_high is null) or (hit_date is not null and hit_high is not null and hit_date >= start_date and hit_high >= target_price)),
 check ((market='KR' and currency='KRW') or (market='US' and currency='USD')),
 unique(round,person)
);
alter table public.club_targets enable row level security;
revoke all on public.club_targets from anon,authenticated;
grant select on public.club_targets to anon,authenticated;
grant all on public.club_targets to service_role;
create policy club_public_read on public.club_targets for select to anon,authenticated using(true);

create function public.record_club_observations(observations jsonb) returns void
language sql security invoker set search_path = '' as $$
 update public.club_targets t set
  quote=case when o.quote->>'asOf' is not null and (t.quote->>'asOf' is null or (o.quote->>'asOf')::timestamptz >= (t.quote->>'asOf')::timestamptz) then o.quote else t.quote end,
  checked_at=greatest(t.checked_at,o.checked_at), check_status=case when t.checked_at is null or o.checked_at>=t.checked_at then o.check_status else t.check_status end,
  history_complete=t.history_complete or coalesce(o.history_complete,false),
  history_from=least(t.history_from,o.history_from), history_through=greatest(t.history_through,o.history_through),
  hit_date=case when o.hit_date>=t.start_date and o.hit_high>=t.target_price and (t.hit_date is null or o.hit_date<t.hit_date) then o.hit_date else t.hit_date end,
  hit_high=case when o.hit_date>=t.start_date and o.hit_high>=t.target_price and (t.hit_date is null or o.hit_date<t.hit_date) then o.hit_high else t.hit_high end,
  peak_price=greatest(t.peak_price,o.peak_price),
  peak_date=case when o.peak_price is not null and (t.peak_price is null or o.peak_price>t.peak_price) then o.peak_date else t.peak_date end,
  source_url=coalesce(o.source_url,t.source_url)
 from jsonb_to_recordset(observations) as o(id text,target_price numeric,start_date date,quote jsonb,checked_at timestamptz,check_status text,history_complete boolean,history_from date,history_through date,hit_date date,hit_high numeric,peak_price numeric,peak_date date,source_url text)
 where t.id=o.id and t.target_price=o.target_price and t.start_date=o.start_date
;
$$;
revoke all on function public.record_club_observations(jsonb) from public,anon,authenticated;
grant execute on function public.record_club_observations(jsonb) to service_role;

insert into public.club_targets(id,round,person,name,market,symbol,currency,target_price,start_date,note) values
('r1-chanyoung',1,'김찬영','HLB','KR','028300','KRW',90000,'2026-10-14','목표가 9만 원으로 변경한 날부터 판정'),
('r2-jinsu',2,'이진수','퀄컴','US','QCOM','USD',300,'2025-11-12',null),
('r2-chanyoung',2,'김찬영','셀트리온제약','KR','068760','KRW',120000,'2025-11-12',null),
('r2-yechan',2,'최예찬','POET','US','POET','USD',20,'2025-11-12',null),
('r2-dayoung',2,'정다영','알파벳 A','US','GOOGL','USD',471,'2025-11-12',null),
('r2-changhyun',2,'백창현','메타','US','META','USD',1010,'2025-11-12',null),
('r3-jinsu',3,'이진수','알파벳 C','US','GOOG','USD',450,'2026-10-14',null),
('r3-chanyoung',3,'김찬영','SK하이닉스','KR','000660','KRW',2500000,'2026-10-14',null),
('r3-yechan',3,'최예찬','인텔','US','INTC','USD',240,'2026-10-14',null),
('r3-dayoung',3,'정다영','삼성전자','KR','005930','KRW',350000,'2026-10-14',null),
('r3-changhyun',3,'백창현','스페이스엑스','US','SPCX','USD',250,'2026-10-14',null);
