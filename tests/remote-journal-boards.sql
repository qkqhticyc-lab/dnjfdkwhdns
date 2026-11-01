begin;
select set_config('test.owner',(select owner_id::text from public.journal_site_settings where singleton),true),set_config('test.visitor',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role)values(current_setting('test.visitor')::uuid,'authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
with made as(insert into public.journal_posts(board,nickname,trade_date,market,symbol,stock_name,side,trade_price,price_currency)values('featured','권한 검증','2026-11-01','KR','005930','권한 검증','buy',100,'KRW')returning id)select set_config('test.post',id::text,true)from made;
select set_config('request.jwt.claim.sub',current_setting('test.visitor'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('test.visitor'),'role','authenticated','user_metadata',json_build_object('user_name','qkqhticyc-lab'))::text,true);
do $$declare rejected boolean:=false;touched integer;begin
 begin insert into public.journal_posts(board,nickname,trade_date,market,symbol,stock_name,side)values('featured','검증','2026-11-01','KR','005930','검증','buy');exception when insufficient_privilege or raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Non-owner featured write was allowed';end if;
 update public.journal_posts set review='bad' where id=current_setting('test.post')::uuid;get diagnostics touched=row_count;if touched<>0 then raise exception 'Non-owner edit was allowed';end if;
end$$;
insert into public.journal_posts(board,nickname,trade_date,market,symbol,stock_name,side,trade_price,price_currency,entry_price)values('public','검증','2026-11-01','US','AAPL','검증','sell',120,'USD',100);
insert into public.journal_post_comments(post_id,nickname,body)values(current_setting('test.post')::uuid,'검증','다른 회원도 운영자 일지에 댓글 작성 가능');
reset role;
rollback;
select 'PASS: real owner featured write, visitor featured denial despite forged metadata, visitor public write and featured comment; all fixtures rolled back' as result;
