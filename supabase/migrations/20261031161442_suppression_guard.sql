create or replace function private.suppress_deleted_journal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and auth.uid()<>old.owner_id then raise exception 'Not authorized';end if;
 if auth.uid()=old.owner_id and old.source='account' and old.external_id is not null then
 insert into public.journal_share_suppressions(owner_id,external_id) values(old.owner_id,old.external_id) on conflict do nothing;
 end if;
 return old;
end;$$;
revoke all on function private.suppress_deleted_journal() from public,anon,authenticated;
