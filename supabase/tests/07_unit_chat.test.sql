-- =============================================================================
-- Stationschat: who can read and write, notifications, editing, moderation
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set jonas '00000000-0000-4000-a000-000000000002'
\set mira  '00000000-0000-4000-a000-000000000004'
\set pdl   '00000000-0000-4000-a000-000000000005'
\set hanna '00000000-0000-4000-a000-000000000006'
\set admin '00000000-0000-4000-a000-000000000007'
\set tom   '00000000-0000-4000-a000-000000000008'

create temp table _ids (k text primary key, v uuid);
grant all on _ids to authenticated;

-- Anna (member of 3A) reads and writes
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  m public.unit_messages;
  c record;
begin
  select * into c from public.my_unit_chats() where unit_id = '30000000-0000-4000-a000-000000000001';
  assert c.unit_id is not null and c.is_member, 'Anna sees the 3A chat';
  assert c.unread_count = 1, format('one unread message for Anna, got %s', c.unread_count);
  assert (select count(*) from public.my_unit_chats()) = 1, 'only her ward';
  assert (select count(*) from public.get_unit_messages('30000000-0000-4000-a000-000000000001')) = 5, 'seed conversation';
  assert (select author_first_name from public.get_unit_messages('30000000-0000-4000-a000-000000000001', null, 1)) = 'Mira', 'newest first, with author';

  m := public.send_unit_message('30000000-0000-4000-a000-000000000001', '  Ich übernehme Samstag den Spätdienst, Jonas!  ');
  assert m.body = 'Ich übernehme Samstag den Spätdienst, Jonas!', 'trimmed';
  assert m.author_employee_id = '40000000-0000-4000-a000-000000000001', 'author set by the database';
  insert into _ids values ('anna_msg', m.id);

  -- other wards / hospitals are closed
  begin
    perform public.send_unit_message('30000000-0000-4000-a000-000000000002', 'falsche Station');
    raise exception 'Anna must not write in 3B';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_unit_messages('30000000-0000-4000-a000-000000000004');
    raise exception 'Anna must not read another hospital';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.send_unit_message('30000000-0000-4000-a000-000000000001', '   ');
    raise exception 'empty message must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.send_unit_message('30000000-0000-4000-a000-000000000001', repeat('x', 2001));
    raise exception 'too long must fail';
  exception when invalid_parameter_value then null;
  end;

  -- no direct writes
  begin
    insert into public.unit_messages (hospital_id, unit_id, body) values
      ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'direkt');
    raise exception 'direct insert must fail';
  exception when insufficient_privilege then null;
  end;

  -- editing own message
  m := public.edit_unit_message(m.id, 'Ich übernehme Samstag, Jonas – trag mich ein, Mira?');
  assert m.edited_at is not null, 'edited';

  -- writing in the chat means having read it; own messages never count as unread
  assert (select unread_count from public.my_unit_chats()) = 0, 'read after sending';
  perform public.mark_unit_chat_read('30000000-0000-4000-a000-000000000001');
  assert (select unread_count from public.my_unit_chats()) = 0, 'still read';
end;
$$;
commit;

-- Notifications: one collapsed notification per member, without text, not for the author
do $$
begin
  assert (select count(*) from public.notifications where type = 'message' and recipient_id = '00000000-0000-4000-a000-000000000001') = 0,
    'author is not notified';
  assert (select count(*) from public.notifications where type = 'message' and recipient_id = '00000000-0000-4000-a000-000000000002') = 1,
    'Jonas is notified';
  assert (select count(*) from public.notifications where type = 'message' and recipient_id = '00000000-0000-4000-a000-000000000006') = 0,
    'HR (not in the ward) is not notified';
  assert not exists (select 1 from public.notifications where type = 'message' and payload::text like '%Spätdienst%'),
    'notifications never contain the message text';
end;
$$;

-- Jonas (3A + ITS1): second message collapses into the existing notification; cannot edit Anna's
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'jonas', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.my_unit_chats()) = 2, 'Jonas has two ward chats';
  begin
    perform public.edit_unit_message((select v from _ids where k = 'anna_msg'), 'gehackt');
    raise exception 'Jonas must not edit Anna''s message';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_unit_message((select v from _ids where k = 'anna_msg'));
    raise exception 'Jonas must not delete Anna''s message';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.hide_unit_message((select v from _ids where k = 'anna_msg'));
    raise exception 'Jonas is no moderator';
  exception when insufficient_privilege then null;
  end;
  perform public.send_unit_message('30000000-0000-4000-a000-000000000001', 'Danke Anna!');
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.send_unit_message('30000000-0000-4000-a000-000000000001', 'Gern!');
end;
$$;
commit;

do $$
begin
  assert (select count(*) from public.notifications where type = 'message' and read_at is null
           and recipient_id = '00000000-0000-4000-a000-000000000004'
           and entity_id = '30000000-0000-4000-a000-000000000001') = 1,
    'Mira has one collapsed notification for three new messages';
end;
$$;

-- HR, hospital admin and the other hospital cannot read the chat at all
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'hanna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.unit_messages) = 0, 'HR sees no messages';
  assert (select count(*) from public.my_unit_chats()) = 0, 'HR has no ward chat';
end;
$$;
commit;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.unit_messages) = 0, 'hospital admin does not read team conversations';
end;
$$;
commit;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.unit_messages where unit_id = '30000000-0000-4000-a000-000000000001'), 'other hospital sees nothing';
  assert (select count(*) from public.my_unit_chats()) = 1, 'Tom only has his own ward';
end;
$$;
commit;

-- Mira (Stationsleitung 3A) moderates; the PDL can read the wards of her department
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  m public.unit_messages;
begin
  perform public.mark_unit_chat_read('30000000-0000-4000-a000-000000000001');
  assert not exists (select 1 from public.notifications where type = 'message' and read_at is null
                      and recipient_id = '00000000-0000-4000-a000-000000000004'), 'opening the chat clears its notification';
  m := public.hide_unit_message((select v from _ids where k = 'anna_msg'));
  assert m.hidden_at is not null and m.body is null, 'hidden and text removed';
  begin
    perform public.hide_unit_message((select id from public.unit_messages where unit_id = '30000000-0000-4000-a000-000000000004' limit 1));
    raise exception 'Mira must not moderate another hospital';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'pdl', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert exists (select 1 from public.my_unit_chats() where unit_id = '30000000-0000-4000-a000-000000000001' and not is_member),
    'PDL reads 3A as moderator';
end;
$$;
commit;

-- Author deletes: text is gone for good; flood protection
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'jonas', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  m public.unit_messages;
  i int;
begin
  select * into m from public.unit_messages where body = 'Danke Anna!';
  m := public.delete_unit_message(m.id);
  assert m.deleted_at is not null and m.body is null, 'deleted';
  begin
    perform public.edit_unit_message(m.id, 'wieder da');
    raise exception 'deleted message cannot be edited';
  exception when invalid_parameter_value then null;
  end;
  begin
    for i in 1..25 loop
      perform public.send_unit_message('30000000-0000-4000-a000-000000000003', format('Nachricht %s', i));
    end loop;
    raise exception 'flood protection must stop at 20 per minute';
  exception when sqlstate 'P0429' then null;
  end;
end;
$$;
rollback;

do $$
begin
  assert not exists (select 1 from public.unit_messages where body like '%übernehme Samstag%'), 'hidden text is not kept anywhere in the table';
  assert not exists (select 1 from public.audit_logs where new_data::text like '%übernehme Samstag%' or old_data::text like '%übernehme Samstag%'),
    'no audit copy of message text';
end;
$$;

\o
\echo '  ✓ Stationschat assertions passed'
