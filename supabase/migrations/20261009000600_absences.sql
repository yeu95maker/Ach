-- =============================================================================
-- ShiftCare · 0600 · Absences: leave requests & sick leave
--
-- Workflow state changes (approve, reject, cancel, acknowledge) are only
-- possible through the RPC functions in 1000_api.sql. Clients may insert their
-- own leave request directly; sick leave is reported via RPC because the
-- comment is encrypted server-side.
-- =============================================================================

create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null,
  employee_id   uuid not null,
  leave_type    public.leave_type not null default 'vacation',
  start_date    date not null,
  end_date      date not null,
  comment       text check (char_length(comment) <= 1000),
  status        public.request_status not null default 'pending',
  decided_by    uuid references public.users (id) on delete set null,
  decided_at    timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (hospital_id, id),
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id) on delete cascade,
  check (end_date >= start_date and end_date - start_date <= 366),
  check ((status in ('approved', 'rejected')) = (decided_at is not null)),
  constraint leave_requests_no_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'))
);

create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);
create index leave_requests_pending_idx  on public.leave_requests (hospital_id, created_at) where status = 'pending';

create trigger leave_requests_set_updated_at
  before update on public.leave_requests
  for each row execute function private.set_updated_at();

-- Server-controlled fields on insert: derive tenant from the employee and
-- force the initial state, whatever the client sent.
create or replace function private.leave_request_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select e.hospital_id into new.hospital_id from public.employees e where e.id = new.employee_id;
  new.status        := 'pending';
  new.decided_by    := null;
  new.decided_at    := null;
  new.decision_note := null;
  return new;
end;
$$;

create trigger leave_requests_before_insert
  before insert on public.leave_requests
  for each row execute function private.leave_request_before_insert();

-- -----------------------------------------------------------------------------
create table public.sick_leaves (
  id                uuid primary key default gen_random_uuid(),
  hospital_id       uuid not null,
  employee_id       uuid not null,
  start_date        date not null,
  end_date          date not null,
  comment_encrypted bytea,     -- pgp_sym_encrypt(comment, vault key) – health data (Art. 9 GDPR)
  status            public.sick_leave_status not null default 'reported',
  certificate_document_id uuid, -- FK added in the documents migration
  reported_by       uuid references public.users (id) on delete set null,
  acknowledged_by   uuid references public.users (id) on delete set null,
  acknowledged_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (hospital_id, id),
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id) on delete cascade,
  check (end_date >= start_date and end_date - start_date <= 366),
  constraint sick_leaves_no_overlap exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('reported', 'acknowledged'))
);

comment on column public.sick_leaves.comment_encrypted is
  'Encrypted with pgcrypto using a key stored in Supabase Vault. Read via public.get_sick_leave_comment().';

create index sick_leaves_employee_idx on public.sick_leaves (employee_id, start_date desc);
create index sick_leaves_open_idx     on public.sick_leaves (hospital_id, start_date) where status = 'reported';

create trigger sick_leaves_set_updated_at
  before update on public.sick_leaves
  for each row execute function private.set_updated_at();
