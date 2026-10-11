-- =============================================================================
-- Pulshift · Diensttausch mit Genehmigung
--
-- 1. An employee offers one of their own published, upcoming shifts to a
--    colleague on the same ward: either as a swap (the colleague gives one of
--    their shifts in return) or as a hand-over (the colleague only takes it).
-- 2. The colleague accepts or declines.
-- 3. The ward lead (schedule.manage) approves or rejects. Only then does the
--    roster change. Nobody can approve a swap they are part of.
--
-- Hard rules (checked when asking, accepting and approving): no absence on
-- that day, no overlapping shift. Soft rules shown as warnings: rest period
-- under 11 h, wish "not available".
-- =============================================================================

create table public.shift_swaps (
  id                 uuid primary key default gen_random_uuid(),
  hospital_id        uuid not null,
  unit_id            uuid not null,
  requester_id       uuid not null,
  requester_entry_id uuid not null,
  partner_id         uuid not null,
  partner_entry_id   uuid,               -- null = hand-over without a shift in return
  note               text check (char_length(note) <= 300),
  status             public.shift_swap_status not null default 'pending_partner',
  responded_at       timestamptz,
  decided_by         uuid references public.users (id) on delete set null,
  decided_at         timestamptz,
  decision_note      text check (char_length(decision_note) <= 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (hospital_id, id),
  check (requester_id <> partner_id),
  check (partner_entry_id is distinct from requester_entry_id),
  foreign key (hospital_id, unit_id)            references public.units (hospital_id, id)            on delete cascade,
  foreign key (hospital_id, requester_id)       references public.employees (hospital_id, id)        on delete cascade,
  foreign key (hospital_id, partner_id)         references public.employees (hospital_id, id)        on delete cascade,
  foreign key (hospital_id, requester_entry_id) references public.schedule_entries (hospital_id, id) on delete cascade,
  foreign key (hospital_id, partner_entry_id)   references public.schedule_entries (hospital_id, id) on delete cascade
);

comment on table public.shift_swaps is
  'Diensttausch: swap or hand-over of shifts between two colleagues, approved by the ward lead. Written only through RPCs.';

-- A shift can be part of only one open request at a time.
create unique index shift_swaps_open_requester_entry on public.shift_swaps (requester_entry_id)
  where status in ('pending_partner', 'pending_lead');
create unique index shift_swaps_open_partner_entry on public.shift_swaps (partner_entry_id)
  where status in ('pending_partner', 'pending_lead') and partner_entry_id is not null;
create index shift_swaps_requester_idx on public.shift_swaps (requester_id, created_at desc);
create index shift_swaps_partner_idx on public.shift_swaps (partner_id, created_at desc);
create index shift_swaps_unit_idx on public.shift_swaps (unit_id, status);

create trigger shift_swaps_set_updated_at
  before update on public.shift_swaps
  for each row execute function private.set_updated_at();

create trigger shift_swaps_audit
  after insert or update or delete on public.shift_swaps
  for each row execute function private.audit_row();

alter table public.shift_swaps enable row level security;
grant select on public.shift_swaps to authenticated;

-- The two people involved, and the leads of the ward.
create policy shift_swaps_select on public.shift_swaps
  for select to authenticated
  using (
    requester_id in (select private.my_employee_ids())
    or partner_id in (select private.my_employee_ids())
    or unit_id in (select private.units_with_permission('schedule.manage'))
  );

-- -----------------------------------------------------------------------------
-- What speaks against p_emp taking shift p_take while giving away p_give?
--   'absence' | 'overlap'  → hard, the swap is not possible
--   'rest' | 'wish'        → soft, shown to everyone involved as a warning
-- -----------------------------------------------------------------------------
create or replace function private.swap_issues(p_emp uuid, p_take uuid, p_give uuid)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_take   public.schedule_entries;
  v_issues text[] := '{}';
begin
  select * into v_take from public.schedule_entries where id = p_take;
  if v_take.id is null or v_take.kind <> 'shift' then
    return array['overlap'];
  end if;

  if exists (select 1 from public.sick_leaves sl
             where sl.employee_id = p_emp and sl.status <> 'cancelled'
               and v_take.entry_date between sl.start_date and sl.end_date)
     or exists (select 1 from public.leave_requests lr
                where lr.employee_id = p_emp and lr.status = 'approved'
                  and v_take.entry_date between lr.start_date and lr.end_date) then
    v_issues := array_append(v_issues, 'absence');
  end if;

  if exists (select 1 from public.schedule_entries o
             where o.employee_id = p_emp and o.kind = 'shift'
               and o.id <> p_take and o.id is distinct from p_give
               and tstzrange(o.starts_at, o.ends_at) && tstzrange(v_take.starts_at, v_take.ends_at)) then
    v_issues := array_append(v_issues, 'overlap');
  end if;

  if exists (select 1 from public.schedule_entries o
             where o.employee_id = p_emp and o.kind = 'shift'
               and o.id <> p_take and o.id is distinct from p_give
               and not tstzrange(o.starts_at, o.ends_at) && tstzrange(v_take.starts_at, v_take.ends_at)
               and (   (o.ends_at <= v_take.starts_at and o.ends_at > v_take.starts_at - interval '11 hours')
                    or (o.starts_at >= v_take.ends_at and o.starts_at < v_take.ends_at + interval '11 hours'))) then
    v_issues := array_append(v_issues, 'rest');
  end if;

  if (select we.preference_type::text from public.wish_entries we
      where we.employee_id = p_emp and we.wish_date = v_take.entry_date
      order by we.created_at desc limit 1) = 'unavailable' then
    v_issues := array_append(v_issues, 'wish');
  end if;

  return v_issues;
end;
$$;
revoke execute on function private.swap_issues(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function private.swap_is_hard(p_issues text[])
returns boolean
language sql immutable
set search_path = ''
as $$ select p_issues && array['absence', 'overlap'] $$;

-- Warnings of both sides, prefixed: own_* (requester) and partner_*.
create or replace function private.swap_warnings(p_requester uuid, p_req_entry uuid, p_partner uuid, p_partner_entry uuid)
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array(select 'partner_' || x from unnest(private.swap_issues(p_partner, p_req_entry, p_partner_entry)) x), '{}')
      || case when p_partner_entry is null then '{}'::text[]
              else coalesce(array(select 'own_' || x from unnest(private.swap_issues(p_requester, p_partner_entry, p_req_entry)) x), '{}') end
$$;
revoke execute on function private.swap_warnings(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- A published shift that has not started yet; returns its ward.
create or replace function private.swappable_unit(p_entry_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_entry public.schedule_entries;
  v_unit  uuid;
begin
  select * into v_entry from public.schedule_entries where id = p_entry_id;
  select s.unit_id into v_unit from public.schedules s
  where s.id = v_entry.schedule_id and s.status = 'published';
  if v_entry.id is null or v_unit is null or v_entry.kind <> 'shift' or v_entry.employee_id is null
     or v_entry.starts_at <= now() then
    raise exception 'This shift cannot be swapped' using errcode = '22023';
  end if;
  return v_unit;
end;
$$;
revoke execute on function private.swappable_unit(uuid) from public, anon, authenticated;

create or replace function private.employee_name(p_employee_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select btrim(u.first_name || ' ' || u.last_name)
  from public.employees e join public.users u on u.id = e.user_id where e.id = p_employee_id
$$;
revoke execute on function private.employee_name(uuid) from public, anon, authenticated;

create or replace function private.swap_payload(s public.shift_swaps)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'swap_id', s.id,
    'unit_name', (select u.name from public.units u where u.id = s.unit_id),
    'requester_name', private.employee_name(s.requester_id),
    'partner_name', private.employee_name(s.partner_id),
    'entry_date', r.entry_date, 'starts_at', r.starts_at, 'ends_at', r.ends_at,
    'partner_entry_date', p.entry_date, 'partner_starts_at', p.starts_at, 'partner_ends_at', p.ends_at,
    'handover', s.partner_entry_id is null)
  from public.schedule_entries r
  left join public.schedule_entries p on p.id = s.partner_entry_id
  where r.id = s.requester_entry_id
$$;
revoke execute on function private.swap_payload(public.shift_swaps) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Who can I swap this shift with? One row per possible hand-over and per
-- colleague's shift that could be given in return (±14 days). Rows with hard
-- conflicts are left out; soft ones come as warnings.
-- -----------------------------------------------------------------------------
create or replace function public.get_swap_options(p_entry_id uuid)
returns table (
  partner_id       uuid,
  first_name       text,
  last_name        text,
  avatar_path      text,
  job_title        text,
  partner_entry_id uuid,
  entry_date       date,
  starts_at        timestamptz,
  ends_at          timestamptz,
  shift_code       text,
  shift_name       text,
  shift_category   public.shift_category,
  warnings         text[]
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_entry public.schedule_entries;
  v_unit  uuid;
begin
  v_unit := private.swappable_unit(p_entry_id);
  select * into v_entry from public.schedule_entries where id = p_entry_id;
  if v_entry.employee_id not in (select private.my_employee_ids()) then
    raise exception 'Only your own shifts can be swapped' using errcode = '42501';
  end if;

  return query
  with members as (
    select e.id, u.first_name, u.last_name, u.avatar_path, e.job_title
    from public.employee_units eu
    join public.employees e on e.id = eu.employee_id and e.status = 'active'
    join public.users u on u.id = e.user_id
    where eu.unit_id = v_unit and e.id <> v_entry.employee_id
  ),
  offers as (
    -- hand-over: the colleague only takes my shift
    select m.*, null::uuid as entry_id
    from members m
    union all
    -- swap: the colleague gives one of their upcoming shifts on this ward in return
    select m.*, o.id
    from members m
    join public.schedule_entries o on o.employee_id = m.id and o.kind = 'shift'
    join public.schedules s on s.id = o.schedule_id and s.status = 'published' and s.unit_id = v_unit
    where o.starts_at > now()
      and o.entry_date between v_entry.entry_date - 14 and v_entry.entry_date + 14
      and not exists (select 1 from public.shift_swaps w
                      where w.status in ('pending_partner', 'pending_lead')
                        and (w.requester_entry_id = o.id or w.partner_entry_id = o.id))
  ),
  checked as (
    select f.*,
           private.swap_issues(f.id, v_entry.id, f.entry_id) as them,
           case when f.entry_id is null then '{}'::text[]
                else private.swap_issues(v_entry.employee_id, f.entry_id, v_entry.id) end as me
    from offers f
  )
  select c.id, c.first_name, c.last_name, c.avatar_path, c.job_title,
         c.entry_id, o.entry_date, o.starts_at, o.ends_at, st.code, st.name, st.category,
         coalesce(array(select 'partner_' || x from unnest(c.them) x), '{}')
           || coalesce(array(select 'own_' || x from unnest(c.me) x), '{}')
  from checked c
  left join public.schedule_entries o on o.id = c.entry_id
  left join public.shift_types st on st.id = o.shift_type_id
  where not private.swap_is_hard(c.them) and not private.swap_is_hard(c.me)
  order by c.last_name, c.first_name, c.entry_id is not null, o.starts_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Ask a colleague
-- -----------------------------------------------------------------------------
create or replace function public.request_shift_swap(
  p_entry_id uuid, p_partner_id uuid, p_partner_entry_id uuid default null, p_note text default null)
returns public.shift_swaps
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_entry   public.schedule_entries;
  v_unit    uuid;
  v_partner public.schedule_entries;
  v_punit   uuid;
  v_result  public.shift_swaps;
begin
  v_unit := private.swappable_unit(p_entry_id);
  select * into v_entry from public.schedule_entries where id = p_entry_id;
  if v_entry.employee_id not in (select private.my_employee_ids()) then
    raise exception 'Only your own shifts can be swapped' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employee_units eu
                 join public.employees e on e.id = eu.employee_id and e.status = 'active'
                 where eu.employee_id = p_partner_id and eu.unit_id = v_unit and e.id <> v_entry.employee_id) then
    raise exception 'The colleague is not a member of this ward' using errcode = '22023';
  end if;
  if p_partner_entry_id is not null then
    v_punit := private.swappable_unit(p_partner_entry_id);
    select * into v_partner from public.schedule_entries where id = p_partner_entry_id;
    if v_partner.employee_id <> p_partner_id or v_punit <> v_unit then
      raise exception 'The shift in return must be the colleague''s shift on this ward' using errcode = '22023';
    end if;
  end if;
  if (select count(*) from public.shift_swaps
      where requester_id = v_entry.employee_id and status in ('pending_partner', 'pending_lead')) >= 10 then
    raise exception 'Too many open swap requests' using errcode = 'P0429';
  end if;
  if exists (select 1 from public.shift_swaps w
             where w.status in ('pending_partner', 'pending_lead')
               and (w.requester_entry_id in (v_entry.id, p_partner_entry_id)
                    or w.partner_entry_id in (v_entry.id, p_partner_entry_id))) then
    raise exception 'There is already an open swap request for this shift' using errcode = '23505';
  end if;
  if private.swap_is_hard(private.swap_issues(p_partner_id, v_entry.id, p_partner_entry_id))
     or (p_partner_entry_id is not null
         and private.swap_is_hard(private.swap_issues(v_entry.employee_id, p_partner_entry_id, v_entry.id))) then
    raise exception 'The swap conflicts with an absence or another shift' using errcode = '23P01';
  end if;

  insert into public.shift_swaps (hospital_id, unit_id, requester_id, requester_entry_id, partner_id, partner_entry_id, note)
  values (v_entry.hospital_id, v_unit, v_entry.employee_id, v_entry.id, p_partner_id, p_partner_entry_id,
          nullif(btrim(p_note), ''))
  returning * into v_result;

  perform private.notify_users(
    v_result.hospital_id,
    array(select e.user_id from public.employees e where e.id = p_partner_id),
    'swap_requested', private.swap_payload(v_result) || jsonb_build_object('note', v_result.note),
    'shift_swap', v_result.id);
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. The colleague answers
-- -----------------------------------------------------------------------------
create or replace function public.respond_shift_swap(p_swap_id uuid, p_accept boolean)
returns public.shift_swaps
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_swap public.shift_swaps;
begin
  select * into v_swap from public.shift_swaps where id = p_swap_id for update;
  if v_swap.id is null or v_swap.partner_id not in (select private.my_employee_ids()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_swap.status <> 'pending_partner' then
    raise exception 'This request is no longer open' using errcode = '22023';
  end if;

  if not p_accept then
    update public.shift_swaps set status = 'declined', responded_at = now()
     where id = p_swap_id returning * into v_swap;
    perform private.notify_users(
      v_swap.hospital_id, array(select e.user_id from public.employees e where e.id = v_swap.requester_id),
      'swap_declined', private.swap_payload(v_swap), 'shift_swap', v_swap.id);
    return v_swap;
  end if;

  perform private.swappable_unit(v_swap.requester_entry_id);
  if v_swap.partner_entry_id is not null then
    perform private.swappable_unit(v_swap.partner_entry_id);
  end if;
  if private.swap_is_hard(private.swap_issues(v_swap.partner_id, v_swap.requester_entry_id, v_swap.partner_entry_id))
     or (v_swap.partner_entry_id is not null
         and private.swap_is_hard(private.swap_issues(v_swap.requester_id, v_swap.partner_entry_id, v_swap.requester_entry_id))) then
    raise exception 'The swap conflicts with an absence or another shift' using errcode = '23P01';
  end if;

  update public.shift_swaps set status = 'pending_lead', responded_at = now()
   where id = p_swap_id returning * into v_swap;

  -- Leads of the ward, but never the two people involved.
  perform private.notify_users(
    v_swap.hospital_id,
    array(select uid from private.unit_user_ids_with_permission(v_swap.unit_id, 'schedule.manage') uid
          where uid not in (select e.user_id from public.employees e where e.id in (v_swap.requester_id, v_swap.partner_id))),
    'swap_pending', private.swap_payload(v_swap), 'shift_swap', v_swap.id);
  return v_swap;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. The ward lead decides. On approval the roster changes.
-- -----------------------------------------------------------------------------
create or replace function public.decide_shift_swap(p_swap_id uuid, p_approve boolean, p_note text default null)
returns public.shift_swaps
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_swap public.shift_swaps;
  v_req  public.schedule_entries;
  v_par  public.schedule_entries;
begin
  select * into v_swap from public.shift_swaps where id = p_swap_id for update;
  if v_swap.id is null or not private.has_unit_permission('schedule.manage', v_swap.unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_swap.requester_id in (select private.my_employee_ids()) or v_swap.partner_id in (select private.my_employee_ids()) then
    raise exception 'You cannot approve a swap you are part of' using errcode = '42501';
  end if;
  if v_swap.status <> 'pending_lead' then
    raise exception 'This request is not waiting for a decision' using errcode = '22023';
  end if;

  if not p_approve then
    update public.shift_swaps
       set status = 'rejected', decided_by = (select auth.uid()), decided_at = now(), decision_note = nullif(btrim(p_note), '')
     where id = p_swap_id returning * into v_swap;
    perform private.notify_users(
      v_swap.hospital_id,
      array(select e.user_id from public.employees e where e.id in (v_swap.requester_id, v_swap.partner_id)),
      'swap_rejected', private.swap_payload(v_swap) || jsonb_build_object('note', v_swap.decision_note),
      'shift_swap', v_swap.id);
    return v_swap;
  end if;

  -- The roster may have changed since the request.
  select * into v_req from public.schedule_entries where id = v_swap.requester_entry_id for update;
  if v_swap.partner_entry_id is not null then
    select * into v_par from public.schedule_entries where id = v_swap.partner_entry_id for update;
  end if;
  perform private.swappable_unit(v_swap.requester_entry_id);
  if v_swap.partner_entry_id is not null then
    perform private.swappable_unit(v_swap.partner_entry_id);
  end if;
  if v_req.employee_id is distinct from v_swap.requester_id
     or (v_swap.partner_entry_id is not null and v_par.employee_id is distinct from v_swap.partner_id) then
    raise exception 'The roster has changed, this swap is no longer possible' using errcode = '22023';
  end if;
  if private.swap_is_hard(private.swap_issues(v_swap.partner_id, v_req.id, v_swap.partner_entry_id))
     or (v_swap.partner_entry_id is not null
         and private.swap_is_hard(private.swap_issues(v_swap.requester_id, v_par.id, v_req.id))) then
    raise exception 'The swap conflicts with an absence or another shift' using errcode = '23P01';
  end if;

  -- Swap without transient double bookings and without the generic
  -- "Dienstplan geändert" notifications (both get one swap_approved instead).
  perform set_config('shiftcare.bulk_import', 'on', true);
  update public.schedule_entries set employee_id = null where id = v_req.id;
  if v_swap.partner_entry_id is not null then
    update public.schedule_entries set employee_id = v_swap.requester_id where id = v_par.id;
    delete from public.schedule_entries
     where employee_id = v_swap.requester_id and entry_date = v_par.entry_date and kind = 'off';
  end if;
  delete from public.schedule_entries
   where employee_id = v_swap.partner_id and entry_date = v_req.entry_date and kind = 'off';
  update public.schedule_entries set employee_id = v_swap.partner_id where id = v_req.id;
  perform set_config('shiftcare.bulk_import', 'off', true);

  update public.shift_swaps
     set status = 'approved', decided_by = (select auth.uid()), decided_at = now(), decision_note = nullif(btrim(p_note), '')
   where id = p_swap_id returning * into v_swap;

  -- Other open requests that involve one of these shifts can no longer work.
  update public.shift_swaps
     set status = 'cancelled'
   where id <> v_swap.id and status in ('pending_partner', 'pending_lead')
     and (requester_entry_id in (v_req.id, v_swap.partner_entry_id) or partner_entry_id in (v_req.id, v_swap.partner_entry_id));

  perform private.notify_users(
    v_swap.hospital_id,
    array(select e.user_id from public.employees e where e.id in (v_swap.requester_id, v_swap.partner_id)),
    'swap_approved', private.swap_payload(v_swap), 'shift_swap', v_swap.id);
  return v_swap;
end;
$$;

-- The requester withdraws (as long as nothing is decided).
create or replace function public.cancel_shift_swap(p_swap_id uuid)
returns public.shift_swaps
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_swap public.shift_swaps;
begin
  update public.shift_swaps
     set status = 'cancelled'
   where id = p_swap_id
     and requester_id in (select private.my_employee_ids())
     and status in ('pending_partner', 'pending_lead')
  returning * into v_swap;
  if v_swap.id is null then
    raise exception 'This request cannot be withdrawn' using errcode = '22023';
  end if;
  return v_swap;
end;
$$;

-- -----------------------------------------------------------------------------
-- List for the "Diensttausch" page: everything I asked, was asked, or have to
-- decide; open ones and those decided in the last 30 days.
--   role: requester | partner | lead
--   expired: still open but the shift has already started
-- -----------------------------------------------------------------------------
create or replace function public.get_shift_swaps()
returns table (
  id                     uuid,
  status                 public.shift_swap_status,
  role                   text,
  expired                boolean,
  unit_id                uuid,
  unit_name              text,
  note                   text,
  decision_note          text,
  created_at             timestamptz,
  decided_at             timestamptz,
  requester_id           uuid,
  requester_name         text,
  partner_id             uuid,
  partner_name           text,
  entry_date             date,
  starts_at              timestamptz,
  ends_at                timestamptz,
  shift_name             text,
  shift_category         public.shift_category,
  partner_entry_id       uuid,
  partner_entry_date     date,
  partner_starts_at      timestamptz,
  partner_ends_at        timestamptz,
  partner_shift_name     text,
  partner_shift_category public.shift_category,
  warnings               text[]
)
language sql stable security definer
set search_path = ''
as $$
  select w.id, w.status,
         case when w.requester_id in (select private.my_employee_ids()) then 'requester'
              when w.partner_id in (select private.my_employee_ids()) then 'partner'
              else 'lead' end,
         w.status in ('pending_partner', 'pending_lead') and r.starts_at <= now(),
         w.unit_id, un.name, w.note, w.decision_note, w.created_at, w.decided_at,
         w.requester_id, private.employee_name(w.requester_id),
         w.partner_id, private.employee_name(w.partner_id),
         r.entry_date, r.starts_at, r.ends_at, rst.name, rst.category,
         w.partner_entry_id, p.entry_date, p.starts_at, p.ends_at, pst.name, pst.category,
         case when w.status in ('pending_partner', 'pending_lead')
              then private.swap_warnings(w.requester_id, w.requester_entry_id, w.partner_id, w.partner_entry_id)
              else '{}'::text[] end
  from public.shift_swaps w
  join public.units un on un.id = w.unit_id
  join public.schedule_entries r on r.id = w.requester_entry_id
  left join public.shift_types rst on rst.id = r.shift_type_id
  left join public.schedule_entries p on p.id = w.partner_entry_id
  left join public.shift_types pst on pst.id = p.shift_type_id
  where (   w.requester_id in (select private.my_employee_ids())
         or w.partner_id in (select private.my_employee_ids())
         -- leads see requests once the colleague has agreed
         or (w.unit_id in (select private.units_with_permission('schedule.manage')) and w.status <> 'pending_partner'))
    and (w.status in ('pending_partner', 'pending_lead') or w.updated_at > now() - interval '30 days')
  order by (w.status in ('pending_partner', 'pending_lead')) desc, r.starts_at
$$;

revoke execute on function
  public.get_swap_options(uuid), public.request_shift_swap(uuid, uuid, uuid, text),
  public.respond_shift_swap(uuid, boolean), public.decide_shift_swap(uuid, boolean, text),
  public.cancel_shift_swap(uuid), public.get_shift_swaps()
from public, anon;
grant execute on function
  public.get_swap_options(uuid), public.request_shift_swap(uuid, uuid, uuid, text),
  public.respond_shift_swap(uuid, boolean), public.decide_shift_swap(uuid, boolean, text),
  public.cancel_shift_swap(uuid), public.get_shift_swaps()
to authenticated;
