-- =============================================================================
-- ShiftCare · Stationschat (one conversation per ward)
--
-- * Every ward (unit) has exactly one chat. Members are the active employees
--   assigned to the ward; moderators (chat.moderate in scope, e.g. PDL) may
--   read, write and hide messages as well. Nobody else – not HR, not the
--   hospital administration – can read a ward chat.
-- * No direct messages, no automatic content: people write, that's it.
-- * Writes only through RPCs (rate limit, author, timestamps set by the DB).
-- * Deleting or hiding a message removes its text from the table; there is
--   no audit copy of message bodies.
-- * Notifications are collapsed: one "new messages in <ward>" notification
--   per person until they open the chat. Notifications never contain the text.
-- =============================================================================

create table public.unit_messages (
  id                 uuid primary key default gen_random_uuid(),
  hospital_id        uuid not null,
  unit_id            uuid not null,
  author_user_id     uuid references public.users (id) on delete set null,
  author_employee_id uuid references public.employees (id) on delete set null,
  body               text,
  created_at         timestamptz not null default now(),
  edited_at          timestamptz,
  deleted_at         timestamptz,   -- removed by the author
  hidden_at          timestamptz,   -- hidden by a moderator
  hidden_by          uuid references public.users (id) on delete set null,
  unique (hospital_id, id),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade,
  -- a visible message has text; a removed one has none
  check (
    (deleted_at is null and hidden_at is null and body is not null and char_length(btrim(body)) between 1 and 2000)
    or ((deleted_at is not null or hidden_at is not null) and body is null)
  )
);

create index unit_messages_unit_created_idx on public.unit_messages (unit_id, created_at desc, id desc);
create index unit_messages_author_recent_idx on public.unit_messages (author_user_id, created_at desc);

comment on table public.unit_messages is
  'Ward chat. One conversation per unit; members = active employees of the unit (+ chat.moderate in scope).';

-- Last time a person opened a ward chat (unread counters).
create table public.unit_chat_reads (
  user_id      uuid not null references public.users (id) on delete cascade,
  unit_id      uuid not null references public.units (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------
create or replace function private.chat_unit_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select private.my_unit_ids()
  union
  select private.units_with_permission('chat.moderate')
$$;
-- Used in RLS policies, so callable by signed-in users; it only reveals the caller's own wards.
revoke execute on function private.chat_unit_ids() from public, anon;
grant execute on function private.chat_unit_ids() to authenticated;

create or replace function private.require_chat_access(p_unit_id uuid)
returns public.units
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_unit public.units;
begin
  select u.* into v_unit from public.units u where u.id = p_unit_id;
  if v_unit.id is null or p_unit_id not in (select private.chat_unit_ids()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return v_unit;
end;
$$;
revoke execute on function private.require_chat_access(uuid) from public, anon, authenticated;

-- Everyone who can read the chat of a ward (for notifications).
create or replace function private.chat_recipient_ids(p_unit_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select private.unit_member_user_ids(p_unit_id)
$$;
revoke execute on function private.chat_recipient_ids(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security: read-only for members, writes only via RPCs
-- -----------------------------------------------------------------------------
alter table public.unit_messages enable row level security;
alter table public.unit_chat_reads enable row level security;

revoke all on public.unit_messages, public.unit_chat_reads from anon, authenticated;
grant select on public.unit_messages, public.unit_chat_reads to authenticated;

create policy unit_messages_select on public.unit_messages
  for select to authenticated
  using (unit_id in (select private.chat_unit_ids()));

create policy unit_chat_reads_select on public.unit_chat_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Live updates (RLS applies to Realtime as well).
alter publication supabase_realtime add table public.unit_messages;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Messages of a ward chat, newest first, with author names. p_before pages back.
create or replace function public.get_unit_messages(p_unit_id uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (
  id uuid,
  unit_id uuid,
  author_user_id uuid,
  author_employee_id uuid,
  author_first_name text,
  author_last_name text,
  author_avatar_path text,
  author_job_title text,
  body text,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  hidden_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.require_chat_access(p_unit_id);
  return query
    select m.id, m.unit_id, m.author_user_id, m.author_employee_id,
           u.first_name, u.last_name, u.avatar_path, e.job_title,
           m.body, m.created_at, m.edited_at, m.deleted_at, m.hidden_at
    from public.unit_messages m
    left join public.users u on u.id = m.author_user_id
    left join public.employees e on e.id = m.author_employee_id
    where m.unit_id = p_unit_id
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- The ward chats I can open, with unread counts and the last activity.
create or replace function public.my_unit_chats()
returns table (
  unit_id uuid,
  hospital_id uuid,
  unit_name text,
  unit_code text,
  is_member boolean,
  last_message_at timestamptz,
  unread_count integer
)
language sql stable security definer
set search_path = ''
as $$
  select u.id, u.hospital_id, u.name, u.code,
         u.id in (select private.my_unit_ids()),
         (select max(m.created_at) from public.unit_messages m where m.unit_id = u.id),
         (select count(*)::int
            from public.unit_messages m
           where m.unit_id = u.id
             and m.deleted_at is null and m.hidden_at is null
             and m.author_user_id is distinct from (select auth.uid())
             and m.created_at > coalesce(
                   (select r.last_read_at from public.unit_chat_reads r where r.user_id = (select auth.uid()) and r.unit_id = u.id),
                   '-infinity'::timestamptz))
  from public.units u
  where u.id in (select private.chat_unit_ids())
  order by (u.id in (select private.my_unit_ids())) desc, u.name
$$;

create or replace function public.send_unit_message(p_unit_id uuid, p_body text)
returns public.unit_messages
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_unit   public.units := private.require_chat_access(p_unit_id);
  v_uid    uuid := (select auth.uid());
  v_body   text := btrim(coalesce(p_body, ''));
  v_author uuid;
  v_msg    public.unit_messages;
begin
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'A message needs 1 to 2000 characters' using errcode = '22023';
  end if;
  -- Simple flood protection: at most 20 messages per minute and person.
  if (select count(*) from public.unit_messages m
       where m.author_user_id = v_uid and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many messages, please wait a moment' using errcode = 'P0429';
  end if;

  select e.id into v_author
  from public.employees e
  where e.user_id = v_uid and e.hospital_id = v_unit.hospital_id and e.status = 'active'
  limit 1;

  insert into public.unit_messages (hospital_id, unit_id, author_user_id, author_employee_id, body)
  values (v_unit.hospital_id, v_unit.id, v_uid, v_author, v_body)
  returning * into v_msg;

  insert into public.unit_chat_reads (user_id, unit_id, last_read_at)
  values (v_uid, v_unit.id, v_msg.created_at)
  on conflict (user_id, unit_id) do update set last_read_at = greatest(public.unit_chat_reads.last_read_at, excluded.last_read_at);

  -- One collapsed notification per person until they open the chat; never the text itself.
  perform private.notify_users(
    v_unit.hospital_id,
    array(
      select r.uid
      from private.chat_recipient_ids(v_unit.id) as r(uid)
      where not exists (
        select 1 from public.notifications n
        where n.recipient_id = r.uid and n.type = 'message' and n.entity_id = v_unit.id and n.read_at is null)
    ),
    'message',
    jsonb_build_object('unit_id', v_unit.id, 'unit_name', v_unit.name),
    'unit_chat',
    v_unit.id);

  return v_msg;
end;
$$;

create or replace function public.edit_unit_message(p_message_id uuid, p_body text)
returns public.unit_messages
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_msg  public.unit_messages;
  v_body text := btrim(coalesce(p_body, ''));
begin
  select m.* into v_msg from public.unit_messages m where m.id = p_message_id;
  if v_msg.id is null or v_msg.author_user_id is distinct from (select auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  perform private.require_chat_access(v_msg.unit_id);
  if v_msg.deleted_at is not null or v_msg.hidden_at is not null then
    raise exception 'The message was removed' using errcode = '22023';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'A message needs 1 to 2000 characters' using errcode = '22023';
  end if;
  update public.unit_messages set body = v_body, edited_at = now()
   where id = v_msg.id
  returning * into v_msg;
  return v_msg;
end;
$$;

-- Author removes their own message: the text is gone, a placeholder remains.
create or replace function public.delete_unit_message(p_message_id uuid)
returns public.unit_messages
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_msg public.unit_messages;
begin
  select m.* into v_msg from public.unit_messages m where m.id = p_message_id;
  if v_msg.id is null or v_msg.author_user_id is distinct from (select auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.unit_messages set body = null, deleted_at = coalesce(deleted_at, now())
   where id = v_msg.id
  returning * into v_msg;
  return v_msg;
end;
$$;

-- Moderator hides a message in a ward chat they moderate.
create or replace function public.hide_unit_message(p_message_id uuid)
returns public.unit_messages
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_msg public.unit_messages;
begin
  select m.* into v_msg from public.unit_messages m where m.id = p_message_id;
  if v_msg.id is null or v_msg.unit_id not in (select private.units_with_permission('chat.moderate')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.unit_messages
     set body = null, hidden_at = coalesce(hidden_at, now()), hidden_by = coalesce(hidden_by, (select auth.uid()))
   where id = v_msg.id
  returning * into v_msg;
  return v_msg;
end;
$$;

-- Opening a chat: unread counter to zero, its collapsed notification marked read.
create or replace function public.mark_unit_chat_read(p_unit_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  perform private.require_chat_access(p_unit_id);
  insert into public.unit_chat_reads (user_id, unit_id, last_read_at)
  values ((select auth.uid()), p_unit_id, now())
  on conflict (user_id, unit_id) do update set last_read_at = now();
  update public.notifications
     set read_at = now()
   where recipient_id = (select auth.uid()) and type = 'message' and entity_id = p_unit_id and read_at is null;
end;
$$;

revoke execute on function
  public.get_unit_messages(uuid, timestamptz, integer),
  public.my_unit_chats(),
  public.send_unit_message(uuid, text),
  public.edit_unit_message(uuid, text),
  public.delete_unit_message(uuid),
  public.hide_unit_message(uuid),
  public.mark_unit_chat_read(uuid)
from public, anon;
grant execute on function
  public.get_unit_messages(uuid, timestamptz, integer),
  public.my_unit_chats(),
  public.send_unit_message(uuid, text),
  public.edit_unit_message(uuid, text),
  public.delete_unit_message(uuid),
  public.hide_unit_message(uuid),
  public.mark_unit_chat_read(uuid)
to authenticated;
