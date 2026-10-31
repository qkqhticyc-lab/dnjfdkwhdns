begin;
alter table public.journal_posts drop constraint journal_posts_market_check;
alter table public.journal_posts add constraint journal_posts_market_check check(market in ('KR','US','HK','JP'));
alter table public.journal_posts add column trade_price numeric(20,8) check(trade_price>0 and trade_price<1000000000000);
alter table public.journal_posts add column price_currency text;
alter table public.journal_posts add constraint journal_posts_price_currency_check check(
 (trade_price is null and price_currency is null) or
 (trade_price is not null and price_currency is not null and
  ((market='KR' and price_currency='KRW')or(market='US' and price_currency='USD')or(market='JP' and price_currency='JPY')or(market='HK' and price_currency in ('HKD','CNY','USD'))))
);
grant insert(trade_price,price_currency),update(trade_price,price_currency) on public.journal_posts to authenticated;
commit;
