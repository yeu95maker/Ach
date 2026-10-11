-- =============================================================================
-- Pulshift · Dokumente (SOPs, Lesebestätigung) + Pflichtfortbildungen
--
-- A. Documents for a ward or the whole hospital (SOPs, guidelines, forms …)
--    - created as draft, the file is uploaded, then published → audience notified
--    - optional read confirmation ("Gelesen und verstanden") per version
--    - a new version replaces the old one (old one is archived, confirmations
--      start again); reminders for those who have not confirmed
-- B. Mandatory trainings (Pflichtfortbildungen)
--    - defined per ward or hospital-wide, optionally with a repeat interval
--    - employees report participation (date, optional certificate as private
--      document); leads confirm or record it themselves
--    - status per person: missing | expired | due_soon (≤ 60 days) | valid
--    - reminders at most every 14 days while missing / expired / due soon
--
-- File contents are never parsed or stored outside the private bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Documents
-- -----------------------------------------------------------------------------
alter table public.documents
  add column description      text check (char_length(description) <= 1000),
  add column requires_ack     boolean not null default false,
  add column published_at     timestamptz,
  add column archived_at      timestamptz,
  add column supersedes_id    uuid,
  add column version          integer not null default 1 check (version between 1 and 999),
  add column reminder_sent_at timestamptz,
  add constraint documents_ack_only_shared check (not requires_ack or employee_id is null),
  add constraint documents_supersedes_fk foreign key (hospital_id, supersedes_id)
    references public.documents (hospital_id, id) on delete set null (supersedes_id);

-- Existing documents were visible right away.
update public.documents set published_at = created_at where published_at is null;

create index documents_shared_idx on public.documents (hospital_id, unit_id)
  where employee_id is null and archived_at is null;

create table public.document_acknowledgements (
  hospital_id     uuid not null,
  document_id     uuid not null,
  employee_id     uuid not null,
  acknowledged_at timestamptz not null default now(),
  primary key (document_id, employee_id),
  foreign key (hospital_id, document_id) references public.documents (hospital_id, id) on delete cascade,
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id) on delete cascade
);
create index document_acknowledgements_employee_idx on public.document_acknowledgements (employee_id);

comment on table public.document_acknowledgements is
  'Lesebestätigung: employee confirmed having read this document version. Written only through acknowledge_document().';

alter table public.document_acknowledgements enable row level security;
grant select on public.document_acknowledgements to authenticated;

-- Who has to read a shared document: the ward, or everybody in the hospital.
create or replace function private.document_audience(p_document_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.id
  from public.documents d
  join public.employees e on e.hospital_id = d.hospital_id and e.status = 'active'
  where d.id = p_document_id and d.employee_id is null
    and (d.visibility = 'hospital'
         or (d.visibility = 'unit' and exists (select 1 from public.employee_units eu
                                               where eu.employee_id = e.id and eu.unit_id = d.unit_id)))
$$;
revoke execute on function private.document_audience(uuid) from public, anon, authenticated;

create or replace function private.manageable_document(p_document_id uuid)
returns public.documents
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if v_doc.id is null or v_doc.employee_id is not null
     or not private.can_manage_document(v_doc.hospital_id, null, v_doc.unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return v_doc;
end;
$$;
revoke execute on function private.manageable_document(uuid) from public, anon, authenticated;

create policy document_acknowledgements_select on public.document_acknowledgements
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or exists (select 1 from public.documents d
               where d.id = document_id and private.can_manage_document(d.hospital_id, null, d.unit_id))
  );

-- -----------------------------------------------------------------------------
-- B. Mandatory trainings
-- -----------------------------------------------------------------------------
create table public.training_requirements (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals (id) on delete cascade,
  unit_id         uuid,             -- NULL = whole hospital
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  description     text check (char_length(description) <= 1000),
  interval_months integer check (interval_months between 1 and 120),  -- NULL = once
  is_active       boolean not null default true,
  created_by      uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (hospital_id, id),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade
);

create table public.training_completions (
  id             uuid primary key default gen_random_uuid(),
  hospital_id    uuid not null,
  requirement_id uuid not null,
  employee_id    uuid not null,
  completed_on   date not null,
  valid_until    date,               -- NULL = does not expire
  document_id    uuid,               -- certificate (private document of the employee)
  note           text check (char_length(note) <= 300),
  reported_by    uuid references public.users (id) on delete set null,
  verified_by    uuid references public.users (id) on delete set null,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (hospital_id, id),
  check (valid_until is null or valid_until > completed_on),
  foreign key (hospital_id, requirement_id) references public.training_requirements (hospital_id, id) on delete cascade,
  foreign key (hospital_id, employee_id)    references public.employees (hospital_id, id)             on delete cascade,
  foreign key (hospital_id, document_id)    references public.documents (hospital_id, id)             on delete set null (document_id)
);
create index training_completions_lookup_idx on public.training_completions (employee_id, requirement_id, completed_on desc);

create table public.training_reminders (
  requirement_id uuid not null references public.training_requirements (id) on delete cascade,
  employee_id    uuid not null references public.employees (id) on delete cascade,
  last_sent_at   timestamptz not null default now(),
  primary key (requirement_id, employee_id)
);

create trigger training_requirements_set_updated_at
  before update on public.training_requirements
  for each row execute function private.set_updated_at();
create trigger training_requirements_audit
  after insert or update or delete on public.training_requirements
  for each row execute function private.audit_row();
create trigger training_completions_audit
  after insert or update or delete on public.training_completions
  for each row execute function private.audit_row();

alter table public.training_requirements enable row level security;
alter table public.training_completions enable row level security;
alter table public.training_reminders enable row level security;   -- no grants: internal only
grant select on public.training_requirements, public.training_completions to authenticated;

create policy training_requirements_select on public.training_requirements
  for select to authenticated
  using (hospital_id in (select private.my_hospital_ids()));

create policy training_completions_select on public.training_completions
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or employee_id in (select private.employees_with_permission('training.manage'))
  );

-- Employees a requirement applies to.
create or replace function private.training_audience(p_requirement_id uuid)
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select e.id
  from public.training_requirements r
  join public.employees e on e.hospital_id = r.hospital_id and e.status = 'active'
  where r.id = p_requirement_id and r.is_active
    and (r.unit_id is null
         or exists (select 1 from public.employee_units eu where eu.employee_id = e.id and eu.unit_id = r.unit_id))
$$;
revoke execute on function private.training_audience(uuid) from public, anon, authenticated;

create or replace function private.can_manage_training(p_hospital_id uuid, p_unit_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case when p_unit_id is null
              then p_hospital_id in (select private.hospitals_with_permission('training.manage'))
              else private.has_unit_permission('training.manage', p_unit_id) end
$$;
revoke execute on function private.can_manage_training(uuid, uuid) from public, anon, authenticated;

create or replace function private.training_status(p_completed boolean, p_valid_until date)
returns text
language sql stable
set search_path = ''
as $$
  select case when not p_completed then 'missing'
              when p_valid_until is null then 'valid'
              when p_valid_until < current_date then 'expired'
              when p_valid_until <= current_date + 60 then 'due_soon'
              else 'valid' end
$$;

-- Certificates linked to a completion are visible to those who manage
-- trainings for that employee (not only to documents.manage holders).
create or replace function private.training_proof_document_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select c.document_id from public.training_completions c
  where c.document_id is not null
    and c.employee_id in (select private.employees_with_permission('training.manage'))
$$;
grant execute on function private.training_proof_document_ids() to authenticated;

-- -----------------------------------------------------------------------------
-- Documents: visibility now respects drafts and archive
-- -----------------------------------------------------------------------------
drop policy documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    employee_id in (select private.my_employee_ids())
    or (published_at is not null and archived_at is null and (
          (visibility = 'hospital' and hospital_id in (select private.hospitals_with_any_permission('documents.view')))
       or (visibility = 'unit' and hospital_id in (select private.hospitals_with_any_permission('documents.view'))
           and unit_id in (select private.my_unit_ids()))))
    or private.can_manage_document(hospital_id, employee_id, unit_id)
    or id in (select private.training_proof_document_ids())
  );

-- -----------------------------------------------------------------------------
-- A. Document RPCs
-- -----------------------------------------------------------------------------
create or replace function public.create_document(
  p_hospital_id uuid, p_unit_id uuid, p_title text, p_category text, p_description text,
  p_requires_ack boolean, p_file_name text, p_mime_type text, p_size_bytes bigint,
  p_supersedes_id uuid default null)
returns public.documents
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_old public.documents;
  v_doc public.documents;
begin
  if p_unit_id is not null and not exists (select 1 from public.units u where u.id = p_unit_id and u.hospital_id = p_hospital_id) then
    raise exception 'Unknown ward' using errcode = '22023';
  end if;
  if not private.can_manage_document(p_hospital_id, null, p_unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_category not in ('sop', 'guideline', 'checklist', 'form', 'information', 'other') then
    raise exception 'Unknown category' using errcode = '22023';
  end if;
  if p_supersedes_id is not null then
    v_old := private.manageable_document(p_supersedes_id);
    if v_old.hospital_id <> p_hospital_id or v_old.unit_id is distinct from p_unit_id
       or v_old.archived_at is not null or v_old.published_at is null then
      raise exception 'Only a published document of the same ward can get a new version' using errcode = '22023';
    end if;
  end if;

  insert into public.documents (hospital_id, unit_id, category, title, description, requires_ack, file_name,
                                mime_type, size_bytes, visibility, supersedes_id, version, storage_path)
  values (p_hospital_id, p_unit_id, p_category, btrim(p_title), nullif(btrim(p_description), ''), coalesce(p_requires_ack, false),
          p_file_name, p_mime_type, p_size_bytes,
          case when p_unit_id is null then 'hospital' else 'unit' end::public.document_visibility,
          p_supersedes_id, coalesce(v_old.version + 1, 1), 'pending')
  returning * into v_doc;
  return v_doc;
end;
$$;

-- After the upload: make it visible and tell the ward. A new version archives
-- the previous one; read confirmations are per version.
create or replace function public.publish_document(p_document_id uuid)
returns public.documents
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_doc public.documents := private.manageable_document(p_document_id);
begin
  if v_doc.published_at is not null then
    raise exception 'Already published' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = v_doc.storage_path) then
    raise exception 'The file has not been uploaded yet' using errcode = '22023';
  end if;

  update public.documents set published_at = now() where id = v_doc.id returning * into v_doc;
  if v_doc.supersedes_id is not null then
    update public.documents set archived_at = now() where id = v_doc.supersedes_id and archived_at is null;
  end if;

  perform private.notify_users(
    v_doc.hospital_id,
    array(select e.user_id from private.document_audience(v_doc.id) a join public.employees e on e.id = a),
    'document_published',
    jsonb_build_object('document_id', v_doc.id, 'title', v_doc.title, 'version', v_doc.version,
                       'requires_ack', v_doc.requires_ack,
                       'unit_name', coalesce((select u.name from public.units u where u.id = v_doc.unit_id),
                                             (select h.name from public.hospitals h where h.id = v_doc.hospital_id))),
    'document', v_doc.id);
  return v_doc;
end;
$$;

create or replace function public.archive_document(p_document_id uuid)
returns public.documents
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_doc public.documents := private.manageable_document(p_document_id);
begin
  update public.documents set archived_at = coalesce(archived_at, now()) where id = v_doc.id returning * into v_doc;
  return v_doc;
end;
$$;

create or replace function public.acknowledge_document(p_document_id uuid)
returns timestamptz
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
  v_emp uuid;
  v_at  timestamptz;
begin
  select * into v_doc from public.documents where id = p_document_id;
  select a into v_emp from private.document_audience(p_document_id) a
  where a in (select private.my_employee_ids()) limit 1;
  if v_doc.id is null or v_emp is null or v_doc.published_at is null or v_doc.archived_at is not null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not v_doc.requires_ack then
    raise exception 'This document needs no confirmation' using errcode = '22023';
  end if;
  insert into public.document_acknowledgements (hospital_id, document_id, employee_id)
  values (v_doc.hospital_id, v_doc.id, v_emp)
  on conflict (document_id, employee_id) do nothing;
  select acknowledged_at into v_at from public.document_acknowledgements where document_id = v_doc.id and employee_id = v_emp;
  return v_at;
end;
$$;

-- Read confirmations of everybody who has to read it (leads only).
create or replace function public.get_document_acks(p_document_id uuid)
returns table (employee_id uuid, first_name text, last_name text, job_title text, acknowledged_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform private.manageable_document(p_document_id);
  return query
  select e.id, u.first_name, u.last_name, e.job_title, k.acknowledged_at
  from private.document_audience(p_document_id) a
  join public.employees e on e.id = a
  join public.users u on u.id = e.user_id
  left join public.document_acknowledgements k on k.document_id = p_document_id and k.employee_id = e.id
  order by k.acknowledged_at is not null, u.last_name, u.first_name;
end;
$$;

-- Reminder to everybody who has not confirmed yet (at most once a day).
create or replace function public.remind_document(p_document_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_doc   public.documents := private.manageable_document(p_document_id);
  v_users uuid[];
begin
  if v_doc.published_at is null or v_doc.archived_at is not null or not v_doc.requires_ack then
    raise exception 'Nothing to remind' using errcode = '22023';
  end if;
  if v_doc.reminder_sent_at > now() - interval '24 hours' then
    raise exception 'A reminder was sent less than 24 hours ago' using errcode = 'P0429';
  end if;
  v_users := private.document_unconfirmed_user_ids(v_doc.id);
  perform private.notify_users(v_doc.hospital_id, v_users, 'document_reminder',
    jsonb_build_object('document_id', v_doc.id, 'title', v_doc.title, 'version', v_doc.version), 'document', v_doc.id);
  update public.documents set reminder_sent_at = now() where id = v_doc.id;
  return coalesce(array_length(v_users, 1), 0);
end;
$$;

create or replace function private.document_unconfirmed_user_ids(p_document_id uuid)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(e.user_id), '{}')
  from private.document_audience(p_document_id) a
  join public.employees e on e.id = a
  where not exists (select 1 from public.document_acknowledgements k where k.document_id = p_document_id and k.employee_id = a)
$$;
revoke execute on function private.document_unconfirmed_user_ids(uuid) from public, anon, authenticated;

-- (acked, audience) for leads, NULLs for everybody else
create or replace function private.document_ack_counts(p_document_id uuid, out acked integer, out audience integer)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if v_doc.id is null or not v_doc.requires_ack or not private.can_manage_document(v_doc.hospital_id, null, v_doc.unit_id) then
    return;
  end if;
  select count(*)::integer, count(k.employee_id)::integer into audience, acked
  from private.document_audience(p_document_id) a
  left join public.document_acknowledgements k on k.document_id = p_document_id and k.employee_id = a;
end;
$$;
grant execute on function private.document_ack_counts(uuid) to authenticated;

-- Shared documents I can see (RLS applies: SECURITY INVOKER), newest first.
create or replace function public.get_documents()
returns table (
  id uuid, hospital_id uuid, unit_id uuid, unit_name text, category text, title text, description text,
  file_name text, mime_type text, size_bytes bigint, storage_path text, version integer,
  requires_ack boolean, published_at timestamptz, created_at timestamptz,
  acknowledged_at timestamptz, can_manage boolean, acked integer, audience integer
)
language sql stable security invoker
set search_path = ''
as $$
  select d.id, d.hospital_id, d.unit_id, u.name, d.category, d.title, d.description,
         d.file_name, d.mime_type, d.size_bytes, d.storage_path, d.version,
         d.requires_ack, d.published_at, d.created_at,
         (select k.acknowledged_at from public.document_acknowledgements k
          where k.document_id = d.id and k.employee_id in (select private.my_employee_ids()) limit 1),
         private.can_manage_document(d.hospital_id, null, d.unit_id),
         c.acked, c.audience
  from public.documents d
  left join public.units u on u.id = d.unit_id
  cross join lateral private.document_ack_counts(d.id) c
  where d.employee_id is null and d.archived_at is null
  order by d.published_at is null desc, d.published_at desc nulls last, d.created_at desc
$$;

-- -----------------------------------------------------------------------------
-- B. Training RPCs
-- -----------------------------------------------------------------------------
create or replace function public.save_training_requirement(
  p_id uuid, p_hospital_id uuid, p_unit_id uuid, p_title text, p_description text, p_interval_months integer)
returns public.training_requirements
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_req public.training_requirements;
begin
  if p_unit_id is not null and not exists (select 1 from public.units u where u.id = p_unit_id and u.hospital_id = p_hospital_id) then
    raise exception 'Unknown ward' using errcode = '22023';
  end if;
  if not private.can_manage_training(p_hospital_id, p_unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.training_requirements (hospital_id, unit_id, title, description, interval_months, created_by)
    values (p_hospital_id, p_unit_id, btrim(p_title), nullif(btrim(p_description), ''), p_interval_months, (select auth.uid()))
    returning * into v_req;
    perform private.notify_users(
      v_req.hospital_id,
      array(select e.user_id from private.training_audience(v_req.id) a join public.employees e on e.id = a),
      'training_assigned',
      jsonb_build_object('requirement_id', v_req.id, 'title', v_req.title, 'interval_months', v_req.interval_months,
                         'unit_name', coalesce((select u.name from public.units u where u.id = v_req.unit_id),
                                               (select h.name from public.hospitals h where h.id = v_req.hospital_id))),
      'training_requirement', v_req.id);
  else
    select * into v_req from public.training_requirements where id = p_id;
    if v_req.id is null or not private.can_manage_training(v_req.hospital_id, v_req.unit_id)
       or v_req.hospital_id <> p_hospital_id or v_req.unit_id is distinct from p_unit_id then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    update public.training_requirements
       set title = btrim(p_title), description = nullif(btrim(p_description), ''), interval_months = p_interval_months
     where id = p_id returning * into v_req;
  end if;
  return v_req;
end;
$$;

create or replace function public.archive_training_requirement(p_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_req public.training_requirements;
begin
  select * into v_req from public.training_requirements where id = p_id;
  if v_req.id is null or not private.can_manage_training(v_req.hospital_id, v_req.unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.training_requirements set is_active = false where id = p_id;
end;
$$;

-- Report participation: for myself (p_employee_id NULL), or – as lead – for
-- someone else (then it counts as confirmed right away).
create or replace function public.report_training(
  p_requirement_id uuid, p_completed_on date, p_document_id uuid default null,
  p_note text default null, p_employee_id uuid default null)
returns public.training_completions
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_req    public.training_requirements;
  v_emp    uuid;
  v_lead   boolean;
  v_result public.training_completions;
begin
  select * into v_req from public.training_requirements where id = p_requirement_id and is_active;
  if v_req.id is null then
    raise exception 'Unknown training' using errcode = '22023';
  end if;
  v_lead := private.can_manage_training(v_req.hospital_id, v_req.unit_id);
  if p_employee_id is null then
    select a into v_emp from private.training_audience(v_req.id) a where a in (select private.my_employee_ids()) limit 1;
  elsif v_lead and p_employee_id in (select private.training_audience(v_req.id)) then
    v_emp := p_employee_id;
  end if;
  if v_emp is null then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_completed_on is null or p_completed_on > current_date or p_completed_on < current_date - interval '10 years' then
    raise exception 'Invalid date' using errcode = '22023';
  end if;
  if p_document_id is not null and not exists (
       select 1 from public.documents d where d.id = p_document_id and d.employee_id = v_emp and d.visibility = 'private') then
    raise exception 'The certificate must be a private document of that person' using errcode = '22023';
  end if;

  insert into public.training_completions (hospital_id, requirement_id, employee_id, completed_on, valid_until,
                                           document_id, note, reported_by, verified_by, verified_at)
  values (v_req.hospital_id, v_req.id, v_emp, p_completed_on,
          case when v_req.interval_months is not null then (p_completed_on + make_interval(months => v_req.interval_months))::date end,
          p_document_id, nullif(btrim(p_note), ''), (select auth.uid()),
          case when p_employee_id is not null then (select auth.uid()) end,
          case when p_employee_id is not null then now() end)
  returning * into v_result;
  delete from public.training_reminders where requirement_id = v_req.id and employee_id = v_emp;
  return v_result;
end;
$$;

create or replace function public.verify_training(p_completion_id uuid)
returns public.training_completions
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_c   public.training_completions;
  v_req public.training_requirements;
begin
  select * into v_c from public.training_completions where id = p_completion_id;
  select * into v_req from public.training_requirements where id = v_c.requirement_id;
  if v_c.id is null or not private.can_manage_training(v_req.hospital_id, v_req.unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_c.employee_id in (select private.my_employee_ids()) then
    raise exception 'You cannot confirm your own training' using errcode = '42501';
  end if;
  update public.training_completions set verified_by = (select auth.uid()), verified_at = now()
   where id = p_completion_id returning * into v_c;
  return v_c;
end;
$$;

-- Own unconfirmed reports can be withdrawn; leads can remove any in scope.
create or replace function public.delete_training_completion(p_completion_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_c   public.training_completions;
  v_req public.training_requirements;
begin
  select * into v_c from public.training_completions where id = p_completion_id;
  select * into v_req from public.training_requirements where id = v_c.requirement_id;
  if v_c.id is null or not (
       (v_c.employee_id in (select private.my_employee_ids()) and v_c.verified_at is null)
       or private.can_manage_training(v_req.hospital_id, v_req.unit_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.training_completions where id = p_completion_id;
end;
$$;

-- My mandatory trainings with the latest participation and status.
create or replace function public.get_my_trainings()
returns table (
  requirement_id uuid, title text, description text, interval_months integer, unit_id uuid, unit_name text,
  completion_id uuid, completed_on date, valid_until date, verified boolean, has_certificate boolean, status text
)
language sql stable security definer
set search_path = ''
as $$
  with mine as (
    select r.*, a as employee_id
    from public.training_requirements r
    cross join lateral private.training_audience(r.id) a
    where r.is_active and a in (select private.my_employee_ids())
  )
  select m.id, m.title, m.description, m.interval_months, m.unit_id, u.name,
         c.id, c.completed_on, c.valid_until, c.verified_at is not null, c.document_id is not null,
         private.training_status(c.id is not null, c.valid_until)
  from mine m
  left join public.units u on u.id = m.unit_id
  left join lateral (select * from public.training_completions tc
                     where tc.requirement_id = m.id and tc.employee_id = m.employee_id
                     order by tc.completed_on desc, tc.created_at desc limit 1) c on true
  order by case private.training_status(c.id is not null, c.valid_until)
             when 'expired' then 0 when 'missing' then 1 when 'due_soon' then 2 else 3 end,
           c.valid_until nulls first, m.title
$$;

-- Lead view: every member of the ward × every training that applies there.
create or replace function public.get_training_overview(p_unit_id uuid)
returns table (
  employee_id uuid, first_name text, last_name text, job_title text,
  requirement_id uuid, title text, interval_months integer, hospital_wide boolean,
  completion_id uuid, completed_on date, valid_until date, verified boolean, document_id uuid, status text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.has_unit_permission('training.manage', p_unit_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
  select e.id, u.first_name, u.last_name, e.job_title,
         r.id, r.title, r.interval_months, r.unit_id is null,
         c.id, c.completed_on, c.valid_until, c.verified_at is not null, c.document_id,
         private.training_status(c.id is not null, c.valid_until)
  from public.employee_units eu
  join public.employees e on e.id = eu.employee_id and e.status = 'active'
  join public.users u on u.id = e.user_id
  join public.units un on un.id = p_unit_id
  join public.training_requirements r on r.is_active and r.hospital_id = un.hospital_id
                                     and (r.unit_id = p_unit_id or r.unit_id is null)
  left join lateral (select * from public.training_completions tc
                     where tc.requirement_id = r.id and tc.employee_id = e.id
                     order by tc.completed_on desc, tc.created_at desc limit 1) c on true
  where eu.unit_id = p_unit_id
  order by u.last_name, u.first_name, r.title;
end;
$$;

-- -----------------------------------------------------------------------------
-- Daily job: training reminders + one automatic read reminder after 7 days
-- -----------------------------------------------------------------------------
create or replace function private.run_document_training_jobs()
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r          record;
  v_trainings integer := 0;
  v_docs      integer := 0;
begin
  for r in
    select req.id as requirement_id, req.hospital_id, req.title, req.created_at, e.id as employee_id, e.user_id,
           c.valid_until, private.training_status(c.id is not null, c.valid_until) as status
    from public.training_requirements req
    cross join lateral private.training_audience(req.id) a
    join public.employees e on e.id = a
    left join lateral (select * from public.training_completions tc
                       where tc.requirement_id = req.id and tc.employee_id = e.id
                       order by tc.completed_on desc limit 1) c on true
    left join public.training_reminders tr on tr.requirement_id = req.id and tr.employee_id = e.id
    where req.is_active
      and private.training_status(c.id is not null, c.valid_until) in ('missing', 'expired', 'due_soon')
      and coalesce(tr.last_sent_at, req.created_at) < now() - interval '14 days'
  loop
    insert into public.notifications (hospital_id, recipient_id, type, payload, entity_type, entity_id)
    values (r.hospital_id, r.user_id, 'training_due',
            jsonb_build_object('requirement_id', r.requirement_id, 'title', r.title, 'status', r.status, 'valid_until', r.valid_until),
            'training_requirement', r.requirement_id);
    insert into public.training_reminders (requirement_id, employee_id, last_sent_at)
    values (r.requirement_id, r.employee_id, now())
    on conflict (requirement_id, employee_id) do update set last_sent_at = excluded.last_sent_at;
    v_trainings := v_trainings + 1;
  end loop;

  for r in
    select d.* from public.documents d
    where d.requires_ack and d.published_at < now() - interval '7 days' and d.archived_at is null
      and d.reminder_sent_at is null
  loop
    perform private.notify_users(r.hospital_id, private.document_unconfirmed_user_ids(r.id), 'document_reminder',
      jsonb_build_object('document_id', r.id, 'title', r.title, 'version', r.version), 'document', r.id);
    update public.documents set reminder_sent_at = now() where id = r.id;
    v_docs := v_docs + 1;
  end loop;

  return jsonb_build_object('training_reminders', v_trainings, 'document_reminders', v_docs);
end;
$$;
revoke execute on function private.run_document_training_jobs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('pulshift-document-training-jobs', '5 6 * * *', 'select private.run_document_training_jobs()');
  end if;
end;
$$;

-- Where may I publish documents / define trainings? (UI choices; the RPCs check again)
create or replace function public.get_document_training_scope(p_hospital_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'document_units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name)
                                from public.units u
                                where u.hospital_id = p_hospital_id and u.id in (select private.units_with_permission('documents.manage'))), '[]'::jsonb),
    'document_hospital', p_hospital_id in (select private.hospitals_with_permission('documents.manage')),
    'training_units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name)
                                from public.units u
                                where u.hospital_id = p_hospital_id and u.id in (select private.units_with_permission('training.manage'))), '[]'::jsonb),
    'training_hospital', p_hospital_id in (select private.hospitals_with_permission('training.manage')))
$$;

revoke execute on function
  public.get_document_training_scope(uuid),
  public.create_document(uuid, uuid, text, text, text, boolean, text, text, bigint, uuid),
  public.publish_document(uuid), public.archive_document(uuid), public.acknowledge_document(uuid),
  public.get_document_acks(uuid), public.remind_document(uuid), public.get_documents(),
  public.save_training_requirement(uuid, uuid, uuid, text, text, integer), public.archive_training_requirement(uuid),
  public.report_training(uuid, date, uuid, text, uuid), public.verify_training(uuid),
  public.delete_training_completion(uuid), public.get_my_trainings(), public.get_training_overview(uuid)
from public, anon;
grant execute on function
  public.get_document_training_scope(uuid),
  public.create_document(uuid, uuid, text, text, text, boolean, text, text, bigint, uuid),
  public.publish_document(uuid), public.archive_document(uuid), public.acknowledge_document(uuid),
  public.get_document_acks(uuid), public.remind_document(uuid), public.get_documents(),
  public.save_training_requirement(uuid, uuid, uuid, text, text, integer), public.archive_training_requirement(uuid),
  public.report_training(uuid, date, uuid, text, uuid), public.verify_training(uuid),
  public.delete_training_completion(uuid), public.get_my_trainings(), public.get_training_overview(uuid)
to authenticated;
