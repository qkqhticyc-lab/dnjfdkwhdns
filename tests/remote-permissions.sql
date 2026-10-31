-- Run as the project's database administrator. All fixtures roll back.
begin;
select set_config('test.member_a',gen_random_uuid()::text,true),
       set_config('test.member_b',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role)
values (current_setting('test.member_a')::uuid,'authenticated','authenticated'),
       (current_setting('test.member_b')::uuid,'authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member_a'),'role','authenticated')::text,true);
do $$
declare entry_id uuid; comment_id uuid;
begin
  insert into public.investment_entries(trade_date,market,symbol,stock_name,side,quantity,price)
  values ('2026-10-31','US','TEST','RLS verification','buy',1,1) returning id into entry_id;
  perform set_config('test.entry_id',entry_id::text,true);
  if not exists(select 1 from public.investment_entries where id=entry_id) then raise exception 'Own read failed'; end if;
  update public.investment_entries set review='Own update works' where id=entry_id;
  if not found then raise exception 'Own update failed'; end if;
  begin
    update public.investment_entries set owner_id=current_setting('test.member_b')::uuid where id=entry_id;
    raise exception 'Owner reassignment was allowed';
  exception when insufficient_privilege then null; end;
  insert into public.investment_comments(nickname,body) values ('RLS test','Rolled back test') returning id into comment_id;
  perform set_config('test.comment_id',comment_id::text,true);
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member_b'),'role','authenticated')::text,true);
do $$
begin
  if exists(select 1 from public.investment_entries where id=current_setting('test.entry_id')::uuid) then raise exception 'Cross-member read allowed'; end if;
  update public.investment_entries set review='forbidden' where id=current_setting('test.entry_id')::uuid;
  if found then raise exception 'Cross-member update allowed'; end if;
  delete from public.investment_entries where id=current_setting('test.entry_id')::uuid;
  if found then raise exception 'Cross-member delete allowed'; end if;
  begin
    insert into public.investment_entries(owner_id,trade_date,market,symbol,stock_name,side,quantity,price)
    values (current_setting('test.member_a')::uuid,'2026-10-31','US','TEST','Forged owner','buy',1,1);
    raise exception 'Forged entry owner allowed';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.investment_comments where id=current_setting('test.comment_id')::uuid) then raise exception 'Public comment read failed'; end if;
  delete from public.investment_comments where id=current_setting('test.comment_id')::uuid;
  if found then raise exception 'Cross-member comment delete allowed'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
begin
  begin
    perform 1 from public.investment_entries;
    raise exception 'Anonymous private access allowed';
  exception when insufficient_privilege then null; end;
  if not exists(select 1 from public.investment_comments where id=current_setting('test.comment_id')::uuid) then raise exception 'Anonymous public comment read failed'; end if;
  begin
    insert into public.investment_comments(nickname,body) values ('anonymous','forbidden');
    raise exception 'Anonymous comment write allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.member_a'),'role','authenticated')::text,true);
do $$
begin
  delete from public.investment_entries where id=current_setting('test.entry_id')::uuid;
  if not found then raise exception 'Own delete failed'; end if;
  delete from public.investment_comments where id=current_setting('test.comment_id')::uuid;
  if not found then raise exception 'Own comment delete failed'; end if;
end $$;
rollback;
select 'PASS: remote RLS; own CRUD, cross-member isolation, owner forgery blocked, public comments, anonymous denial; all fixtures rolled back' as result;
