-- =============================================================================
-- Agency teams and the email outbox
-- =============================================================================
\o /dev/null
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

begin;
-- a new user who will join ABC Properties as an agent, and an outsider
insert into auth.users (id, email, raw_user_meta_data) values
  ('99000000-0000-4000-8000-000000000001', 'agent.joe@example.com', '{"full_name":"Joe Agent"}'),
  ('99000000-0000-4000-8000-000000000002', 'mallory@example.com', '{"full_name":"Mallory"}');

select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');  -- ABC owner
do $$
declare v_token text;
begin
  v_token := public.team_invite(' Agent.Joe@example.com ', 'agent');
  perform set_config('test.token', v_token, true);
  assert (public.team_list() -> 'invites' -> 0 ->> 'email') = 'agent.joe@example.com', 'invite listed';
  begin
    perform public.team_invite('abc@demo.property', 'agent');
    raise exception 'owner invited again';
  exception when unique_violation then null;
  end;
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.email_outbox where to_email = 'agent.joe@example.com' and kind = 'team_invite'
                 and link like '/provider/join?token=%' and params ->> 'provider' = 'ABC Properties'), 'invite email queued';
end $$;

select pg_temp.act_as('99000000-0000-4000-8000-000000000002');  -- wrong person
do $$ begin
  perform public.accept_provider_invite(current_setting('test.token'));
  raise exception 'invite accepted by someone else';
exception when insufficient_privilege then null;
end $$;

select pg_temp.act_as('99000000-0000-4000-8000-000000000001');  -- Joe
do $$
declare n int;
begin
  assert public.accept_provider_invite(current_setting('test.token')) = 'd0000000-0000-4000-8000-000000000001', 'joined';
  assert public.my_account() -> 'provider' ->> 'role' = 'agent', 'agent role';
  assert (select count(*) from public.conversations) = 1, 'agent sees the agency inbox';
  update public.properties set price = 175000 where id = 'e0000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'agent edits agency listings';
  insert into storage.objects (bucket_id, name) values ('property-images', 'd0000000-0000-4000-8000-000000000001/x/agent.jpg');
  assert public.get_property('e0000000-0000-4000-8000-000000000017') ->> 'status' = 'pending', 'agent previews agency drafts';
  begin
    perform public.team_invite('x@example.com', 'agent');
    raise exception 'agent invited';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.start_conversation('e0000000-0000-4000-8000-000000000002', 'hi');
    raise exception 'agent messaged own agency';
  exception when others then
    if position('OWN_PROPERTY' in sqlerrm) = 0 then raise; end if;
  end;
  update public.providers set status = 'verified', display_name = 'Hacked' where id = 'd0000000-0000-4000-8000-000000000001';
  assert (select display_name from public.providers where id = 'd0000000-0000-4000-8000-000000000001') = 'ABC Properties', 'agent cannot edit provider profile';
end $$;

-- Customer writes into the (2-day-old) conversation → email to owner and agent, throttled
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
insert into public.messages (conversation_id, sender_id, body) values ('f0000000-0000-4000-8000-000000000001', auth.uid(), 'Is Saturday possible?');
insert into public.messages (conversation_id, sender_id, body) values ('f0000000-0000-4000-8000-000000000001', auth.uid(), 'Or Sunday?');
reset role;
do $$ begin
  assert (select count(*) from public.email_outbox where kind = 'new_message') = 2, 'one email each for owner and agent';
  assert exists (select 1 from public.email_outbox where kind = 'new_message' and user_id = '99000000-0000-4000-8000-000000000001'
                 and params ->> 'title' = 'Modern Family House'), 'agent emailed';
end $$;

-- Owner removes the agent → access gone
select pg_temp.act_as('b0000000-0000-4000-8000-000000000001');
select public.team_remove('99000000-0000-4000-8000-000000000001');
select pg_temp.act_as('99000000-0000-4000-8000-000000000001');
do $$ begin
  assert public.my_account() -> 'provider' = 'null'::jsonb, 'no provider after removal';
  assert (select count(*) from public.conversations) = 0, 'no inbox after removal';
end $$;
rollback;

-- Notifications → email (respecting the opt-out); worker claim/mark
begin;
update public.profiles set email_notifications = false where id = 'c0000000-0000-4000-8000-000000000001';
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select public.admin_moderate_property('e0000000-0000-4000-8000-000000000017', 'approve', null, false);
select public.admin_set_membership('c0000000-0000-4000-8000-000000000001', 1);
reset role;
update public.properties set price = price - 1000 where id = 'e0000000-0000-4000-8000-000000000001';  -- favourited by Tariro (opted out)
do $$ begin
  assert exists (select 1 from public.email_outbox where user_id = 'b0000000-0000-4000-8000-000000000001' and kind = 'property_approved'), 'approval email';
  assert not exists (select 1 from public.email_outbox where user_id = 'c0000000-0000-4000-8000-000000000001'), 'opted-out user gets no email';
end $$;
set local role service_role;
do $$
declare b jsonb := public.email_outbox_claim(10);
begin
  assert jsonb_array_length(b) >= 1 and (b -> 0 ->> 'to') = 'abc@demo.property' and (b -> 0 ->> 'locale') = 'en', 'claimed with address';
  assert jsonb_array_length(public.email_outbox_claim(10)) = 0, 'not claimed twice';
  perform public.email_outbox_mark((b -> 0 ->> 'id')::uuid, true);
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.email_outbox where status = 'sent' and sent_at is not null), 'marked sent';
end $$;
select pg_temp.act_as('c0000000-0000-4000-8000-000000000001');
do $$ begin
  begin
    perform 1 from public.email_outbox;
    raise exception 'user read outbox';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.email_outbox_claim(1);
    raise exception 'user claimed emails';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
\o
\echo '  ✓ teams & email tests'
