-- =============================================================================
-- ShiftCare · 0800 · Documents & file storage
--
-- Metadata lives in public.documents (RLS protected); the binary lives in the
-- private Supabase Storage bucket "documents" under
--     {hospital_id}/{document_id}/{file_name}
-- Storage policies authorise every object access through the metadata row,
-- so file access always follows the same rules as the documents table.
-- =============================================================================

create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  employee_id uuid,             -- owner (personal document), NULL = shared document
  unit_id     uuid,             -- ward for visibility = 'unit'
  category    text not null default 'general' check (category ~ '^[a-z_]{2,32}$'),
  title       text not null check (char_length(title) between 1 and 200),
  file_name   text not null check (char_length(file_name) between 1 and 200 and file_name !~ '[/\\]'),
  storage_path text not null unique,
  mime_type   text not null check (mime_type in (
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes  bigint not null check (size_bytes between 1 and 20971520),
  visibility  public.document_visibility not null default 'private',
  uploaded_by uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (hospital_id, id),
  foreign key (hospital_id, employee_id) references public.employees (hospital_id, id) on delete cascade,
  foreign key (hospital_id, unit_id)     references public.units (hospital_id, id)     on delete cascade,
  check (visibility <> 'unit' or unit_id is not null),
  check (visibility <> 'private' or employee_id is not null)
);

create index documents_employee_idx on public.documents (employee_id) where employee_id is not null;
create index documents_hospital_idx on public.documents (hospital_id, created_at desc);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function private.set_updated_at();

-- The storage path is derived server-side; clients cannot choose it.
create or replace function private.document_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.storage_path := new.hospital_id::text || '/' || new.id::text || '/' || new.file_name;
  new.uploaded_by  := coalesce((select auth.uid()), new.uploaded_by);
  return new;
end;
$$;

create trigger documents_before_insert
  before insert on public.documents
  for each row execute function private.document_before_insert();

-- Deferred foreign keys from earlier migrations
alter table public.employee_qualifications
  add constraint employee_qualifications_document_fk
  foreign key (hospital_id, document_id) references public.documents (hospital_id, id) on delete set null (document_id);

alter table public.sick_leaves
  add constraint sick_leaves_certificate_fk
  foreign key (hospital_id, certificate_document_id) references public.documents (hospital_id, id) on delete set null (certificate_document_id);

-- -----------------------------------------------------------------------------
-- Storage buckets (private). Avatars: {user_id}/{file}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 20971520, array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
