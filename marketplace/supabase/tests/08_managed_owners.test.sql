-- =============================================================================
-- Managed owners: admins list on behalf of owners without an account
-- =============================================================================
\o /dev/null
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('98000000-0000-4000-8000-000000000001', 'stand.owner@example.com', '{"full_name":"Stand Owner"}');

-- Only admins manage owners -----------------------------------------------------------
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');  -- customer
do $$ begin
  perform public.admin_save_managed_owner('{"display_name":"Mr Moyo","contact_phone":"+263771234567","id_document_number":"63-123456A-12"}');
  raise exception 'customer created managed owner';
exception when insufficient_privilege then null;
end $$;

-- Admin creates an owner, with papers in the admin's own folder ---------------------------
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$
declare v_id uuid;
begin
  begin
    perform public.admin_save_managed_owner('{"display_name":"Mr Moyo","contact_phone":"+263771234567"}');
    raise exception 'owner without papers accepted';
  exception when others then
    if sqlerrm <> 'VERIFICATION_REQUIRED' then raise; end if;
  end;
  begin
    perform public.admin_save_managed_owner('{"display_name":"Mr Moyo","contact_phone":"+263771234567","document_paths":["someone-else/id.jpg"]}');
    raise exception 'foreign document accepted';
  exception when insufficient_privilege then null;
  end;

  v_id := public.admin_save_managed_owner(jsonb_build_object(
    'display_name', 'Mr Moyo – Ruwa stands', 'provider_type', 'private_seller', 'city', 'Ruwa',
    'contact_name', 'Tendai Moyo', 'contact_email', 'Stand.Owner@example.com', 'contact_phone', '+263771234567',
    'id_document_type', 'national_id', 'id_document_number', '63-123456A-12',
    'document_paths', jsonb_build_array('a0000000-0000-4000-8000-000000000001/managed/id.jpg')));
  perform set_config('test.owner', v_id::text, true);
  assert (select status = 'verified' and owner_id is null and contact_email = 'stand.owner@example.com' and char_length(claim_token) = 36
          from public.providers where id = v_id), 'managed owner created verified';
  assert (select status = 'approved' from public.provider_verifications where provider_id = v_id), 'papers stored as approved';
  assert jsonb_array_length(public.admin_list_managed_owners()) = 1, 'listed';
  assert exists (select 1 from jsonb_array_elements(public.admin_list_providers()) x where x ->> 'id' = v_id::text and (x ->> 'managed')::boolean),
    'shows in provider list';

  -- Act as the owner: the normal provider tools now work for them
  perform public.admin_act_as(v_id);
  assert private.my_provider_id() = v_id and private.my_provider_role() = 'admin', 'acting';
  assert (public.my_account() -> 'provider' ->> 'acting')::boolean, 'account shows acting';
  perform set_config('test.listing', public.save_property(jsonb_build_object(
      'category', 'land', 'transaction', 'sale', 'title', '500 m² stand in Ruwa', 'country', 'Zimbabwe', 'city', 'Ruwa',
      'area', 'Ruwa', 'latitude', -17.89, 'longitude', 31.24, 'price', 25000, 'land_size_m2', 500),
    array['water', 'road_access']::public.property_feature[],
    array[v_id::text || '/plot/1.jpg'], '[]', true)::text, true);
  assert (select provider_id = v_id and status = 'pending' from public.properties where id = current_setting('test.listing')::uuid),
    'listing saved for the owner';
  perform public.admin_moderate_property(current_setting('test.listing')::uuid, 'approve');
  perform public.admin_act_as(null);
  assert private.my_provider_id() is null, 'stopped acting';
end $$;
reset role;

-- A customer asks: the admin is notified, the owner gets an email with the claim link ----------
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  perform set_config('test.conv', public.start_conversation(current_setting('test.listing')::uuid, 'Is the stand still available?')::text, true);
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where user_id = 'a0000000-0000-4000-8000-000000000001' and kind = 'new_inquiry'),
    'admin notified of inquiry';
  assert (select count(*) from public.email_outbox where to_email = 'stand.owner@example.com' and kind = 'owner_message'
          and link like '/claim?token=%') = 1, 'owner emailed';
end $$;

select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
insert into public.messages (conversation_id, sender_id, body)
values (current_setting('test.conv')::uuid, 'c0000000-0000-4000-8000-000000000001', 'Can I view it on Saturday?');
reset role;
do $$ begin
  assert (select count(*) from public.email_outbox where to_email = 'stand.owner@example.com' and kind = 'owner_message') = 1,
    'owner emails throttled';
end $$;

-- The admin answers from the inbox without acting for the owner ---------------------------------
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$ begin
  assert public.get_conversation(current_setting('test.conv')::uuid) ->> 'role' = 'provider', 'admin opens conversation as provider';
  assert exists (select 1 from jsonb_array_elements(public.list_conversations()) x where x ->> 'id' = current_setting('test.conv')), 'in admin inbox';
end $$;
insert into public.messages (conversation_id, sender_id, body)
values (current_setting('test.conv')::uuid, 'a0000000-0000-4000-8000-000000000001', 'Yes, Saturday 10:00 works.');
reset role;

-- Other users cannot act as or claim with a wrong token ---------------------------------------------
select pg_temp.act_as('c0000000-0000-4000-8000-000000000002');
do $$ begin
  begin
    perform public.admin_act_as(current_setting('test.owner')::uuid);
    raise exception 'customer acted as owner';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set acting_provider_id = current_setting('test.owner')::uuid where id = auth.uid();
  assert private.my_provider_id() is null, 'acting column is protected';
  assert public.get_conversation(current_setting('test.conv')::uuid) is null, 'other customer cannot read';
  begin
    perform public.claim_provider('not-the-right-token-at-all');
    raise exception 'claimed with wrong token';
  exception when others then
    if sqlerrm <> 'CLAIM_INVALID' then raise; end if;
  end;
end $$;
reset role;

-- New claim link by email, then the owner signs up and claims -------------------------------------
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$ begin
  perform set_config('test.token', public.admin_claim_link(current_setting('test.owner')::uuid, true), true);
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.email_outbox where kind = 'provider_claim' and to_email = 'stand.owner@example.com'
                 and link = '/claim?token=' || current_setting('test.token')), 'claim email queued';
end $$;

select pg_temp.act_as('98000000-0000-4000-8000-000000000001');
do $$ begin
  assert public.get_claim(current_setting('test.token')) ->> 'provider' = 'Mr Moyo – Ruwa stands', 'claim page info';
  assert public.claim_provider(current_setting('test.token')) = current_setting('test.owner')::uuid, 'claimed';
  assert private.my_provider_id() = current_setting('test.owner')::uuid and private.my_provider_role() = 'owner', 'owner now';
  assert public.get_conversation(current_setting('test.conv')::uuid) ->> 'role' = 'provider', 'owner sees the inquiry';
  assert public.get_claim(current_setting('test.token')) is null, 'token used up';
end $$;
reset role;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
do $$ begin
  assert public.get_conversation(current_setting('test.conv')::uuid) is null, 'admin no longer in the claimed owner''s inbox';
  begin
    perform public.admin_act_as(current_setting('test.owner')::uuid);
    raise exception 'acted for claimed owner';
  exception when others then
    if sqlerrm <> 'NOT_FOUND' then raise; end if;
  end;
  perform public.admin_set_provider_suspended(current_setting('test.owner')::uuid, false);
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.email_outbox where to_email = 'stand.owner@example.com' and kind = 'owner_message') = 1,
    'no owner emails after claim';
end $$;
rollback;
\o
\echo '  ✓ managed owner tests'
