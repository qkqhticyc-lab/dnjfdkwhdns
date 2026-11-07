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
