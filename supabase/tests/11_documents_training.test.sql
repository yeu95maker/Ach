-- =============================================================================
-- Dokumente (SOPs, Lesebestätigung) + Pflichtfortbildungen
-- =============================================================================
\o /dev/null
\set anna  '00000000-0000-4000-a000-000000000001'
\set jonas '00000000-0000-4000-a000-000000000002'
\set mira  '00000000-0000-4000-a000-000000000004'
\set tom   '00000000-0000-4000-a000-000000000008'

create temp table _dt (k text primary key, v text);
grant all on _dt to authenticated;

-- -----------------------------------------------------------------------------
-- A1. Mira (Stationsleitung 3A) creates a ward SOP; it stays a draft until the
--     file is uploaded and the document is published.
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  d public.documents;
begin
  assert (public.get_document_training_scope('10000000-0000-4000-a000-000000000001') -> 'document_units' -> 0 ->> 'id')
       = '30000000-0000-4000-a000-000000000001', 'scope: own ward';
  assert not (public.get_document_training_scope('10000000-0000-4000-a000-000000000001') ->> 'document_hospital')::boolean, 'scope: not hospital-wide';
  d := public.create_document('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
         'SOP Händedesinfektion', 'sop', 'Bitte bis Monatsende lesen.', true,
         'sop-haendedesinfektion.pdf', 'application/pdf', 120000);
  assert d.published_at is null and d.visibility = 'unit' and d.version = 1, 'draft for the ward';
  assert d.storage_path = '10000000-0000-4000-a000-000000000001/' || d.id || '/sop-haendedesinfektion.pdf', 'server-side path';
  insert into _dt values ('sop', d.id::text), ('path', d.storage_path);
  begin
    perform public.publish_document(d.id);
    raise exception 'publishing without file must fail';
  exception when invalid_parameter_value then null;
  end;
  -- not allowed for another ward / hospital-wide
  begin
    perform public.create_document('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000002',
              'X', 'sop', null, false, 'x.pdf', 'application/pdf', 10);
    raise exception 'other ward must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_document('10000000-0000-4000-a000-000000000001', null, 'X', 'sop', null, false, 'x.pdf', 'application/pdf', 10);
    raise exception 'hospital-wide must fail for a ward lead';
  exception when insufficient_privilege then null;
  end;
  -- upload (the storage policy allows it for the fresh row of the uploader)
  insert into storage.objects (bucket_id, name, owner) values ('documents', d.storage_path, auth.uid());
end;
$$;
commit;

-- the draft is invisible to the ward
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.get_documents() g where g.id = (select v::uuid from _dt where k = 'sop')), 'draft hidden';
  assert not exists (select 1 from public.documents where id = (select v::uuid from _dt where k = 'sop')), 'draft hidden (RLS)';
  assert not exists (select 1 from storage.objects where name = (select v from _dt where k = 'path')), 'file of draft hidden';
end;
$$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  d public.documents;
begin
  d := public.publish_document((select v::uuid from _dt where k = 'sop'));
  assert d.published_at is not null, 'published';
end;
$$;
commit;

do $$
begin
  assert (select count(*) from public.notifications where type = 'document_published'
          and entity_id = (select v::uuid from _dt where k = 'sop')
          and recipient_id in ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003')) = 3,
    'the ward is notified';
  assert not exists (select 1 from public.notifications where type = 'document_published'
                     and entity_id = (select v::uuid from _dt where k = 'sop') and recipient_id = '00000000-0000-4000-a000-000000000008'),
    'other hospital is not notified';
end;
$$;

-- -----------------------------------------------------------------------------
-- A2. Anna reads and confirms; Mira sees who confirmed; reminder goes to the rest
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g record;
begin
  select * into g from public.get_documents() x where x.id = (select v::uuid from _dt where k = 'sop');
  assert g.id is not null and g.requires_ack and g.acknowledged_at is null, 'Anna sees the SOP, not yet confirmed';
  assert g.can_manage = false and g.acked is null and g.audience is null, 'no statistics for nurses';
  assert exists (select 1 from storage.objects where name = (select v from _dt where k = 'path')), 'Anna may download the file';
  assert public.acknowledge_document(g.id) is not null, 'confirmed';
  assert public.acknowledge_document(g.id) is not null, 'confirming twice is harmless';
  assert (select x.acknowledged_at from public.get_documents() x where x.id = g.id) is not null, 'shows as confirmed';
  begin
    perform public.get_document_acks(g.id);
    raise exception 'nurses cannot list confirmations';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  g record;
  n int;
begin
  select * into g from public.get_documents() x where x.id = (select v::uuid from _dt where k = 'sop');
  assert g.can_manage and g.acked = 1 and g.audience = 4, format('1 of 4 confirmed (%s/%s)', g.acked, g.audience);
  assert (select count(*) from public.get_document_acks(g.id) a where a.acknowledged_at is not null) = 1, 'list of confirmations';
  n := public.remind_document(g.id);
  assert n = 3, format('reminder to the 3 others (%s)', n);
  begin
    perform public.remind_document(g.id);
    raise exception 'second reminder within 24 h must fail';
  exception when sqlstate 'P0429' then null;
  end;
end;
$$;
commit;

do $$
begin
  assert not exists (select 1 from public.notifications where type = 'document_reminder'
                     and recipient_id = '00000000-0000-4000-a000-000000000001'), 'Anna (confirmed) gets no reminder';
  assert exists (select 1 from public.notifications where type = 'document_reminder'
                 and recipient_id = '00000000-0000-4000-a000-000000000002'), 'Jonas gets a reminder';
end;
$$;

-- -----------------------------------------------------------------------------
-- A3. New version: old one archived, confirmations start again
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  d public.documents;
begin
  d := public.create_document('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
         'SOP Händedesinfektion', 'sop', null, true, 'sop-v2.pdf', 'application/pdf', 130000,
         (select v::uuid from _dt where k = 'sop'));
  assert d.version = 2, 'version 2';
  insert into storage.objects (bucket_id, name, owner) values ('documents', d.storage_path, auth.uid());
  perform public.publish_document(d.id);
  insert into _dt values ('sop2', d.id::text);
end;
$$;
commit;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.get_documents() x where x.id = (select v::uuid from _dt where k = 'sop')), 'old version gone';
  assert (select x.acknowledged_at from public.get_documents() x where x.id = (select v::uuid from _dt where k = 'sop2')) is null,
    'new version must be confirmed again';
end;
$$;
rollback;

-- -----------------------------------------------------------------------------
-- A4. Isolation: other hospital, other ward
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'tom', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.get_documents() x where x.id = (select v::uuid from _dt where k = 'sop2')), 'other hospital sees nothing';
  assert not exists (select 1 from storage.objects where bucket_id = 'documents'), 'no files of the other hospital';
  begin
    perform public.acknowledge_document((select v::uuid from _dt where k = 'sop2'));
    raise exception 'other hospital cannot confirm';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- -----------------------------------------------------------------------------
-- B1. Mandatory training for the ward, Anna reports, Mira confirms
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  r public.training_requirements;
begin
  r := public.save_training_requirement(null, '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
         'Reanimationstraining', 'Jährlich, BLS/ALS', 12);
  insert into _dt values ('req', r.id::text);
  begin
    perform public.save_training_requirement(null, '10000000-0000-4000-a000-000000000001', null, 'Brandschutz', null, 24);
    raise exception 'hospital-wide training must fail for a ward lead';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

do $$
begin
  assert (select count(*) from public.notifications where type = 'training_assigned'
          and entity_id = (select v::uuid from _dt where k = 'req')) = 3, 'ward (without the lead herself) is told';
end;
$$;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  t record;
  c public.training_completions;
  proof public.documents;
begin
  select * into t from public.get_my_trainings() x where x.requirement_id = (select v::uuid from _dt where k = 'req');
  assert t.status = 'missing', 'missing at first';

  begin
    perform public.report_training(t.requirement_id, current_date + 1);
    raise exception 'future date must fail';
  exception when invalid_parameter_value then null;
  end;

  -- certificate as a private document of Anna
  insert into public.documents (hospital_id, employee_id, category, title, file_name, mime_type, size_bytes, visibility)
  values ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', 'training_proof',
          'Teilnahmebescheinigung', 'bescheinigung.pdf', 'application/pdf', 5000, 'private')
  returning * into proof;
  insert into _dt values ('proof', proof.id::text);

  c := public.report_training(t.requirement_id, current_date - 320, proof.id, 'Kurs im Haus');
  assert c.valid_until = (current_date - 320 + interval '12 months')::date, 'valid for 12 months';
  assert c.verified_at is null, 'self-reported, not yet confirmed';
  insert into _dt values ('completion', c.id::text);

  select * into t from public.get_my_trainings() x where x.requirement_id = (select v::uuid from _dt where k = 'req');
  assert t.status = 'due_soon' and t.has_certificate and not t.verified, format('due within 60 days (%s)', t.status);

  begin
    perform public.verify_training(c.id);
    raise exception 'own confirmation must fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

-- Jonas (nurse on the ward) sees neither Anna's completion nor her certificate
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'jonas', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not exists (select 1 from public.training_completions where employee_id = '40000000-0000-4000-a000-000000000001'), 'colleagues see no completions';
  assert not exists (select 1 from public.documents where id = (select v::uuid from _dt where k = 'proof')), 'colleagues see no certificate';
  begin
    perform public.get_training_overview('30000000-0000-4000-a000-000000000001');
    raise exception 'nurses get no overview';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  o record;
  c public.training_completions;
begin
  assert exists (select 1 from public.documents where id = (select v::uuid from _dt where k = 'proof')), 'lead sees the certificate';
  c := public.verify_training((select v::uuid from _dt where k = 'completion'));
  assert c.verified_at is not null, 'confirmed by the lead';
  -- lead records Jonas' participation directly
  c := public.report_training((select v::uuid from _dt where k = 'req'), current_date - 10, null, null, '40000000-0000-4000-a000-000000000002');
  assert c.verified_at is not null, 'recorded by the lead = confirmed';

  select count(*) filter (where x.status = 'missing') as missing, count(*) filter (where x.status = 'valid') as valid,
         count(*) filter (where x.status = 'due_soon') as due
    into o
  from public.get_training_overview('30000000-0000-4000-a000-000000000001') x
  where x.requirement_id = (select v::uuid from _dt where k = 'req');
  assert o.valid = 1 and o.due = 1 and o.missing = 2, format('overview %s valid, %s due, %s missing', o.valid, o.due, o.missing);
end;
$$;
commit;

-- -----------------------------------------------------------------------------
-- B2. Daily job: reminders for missing trainings (not more often than 14 days)
-- -----------------------------------------------------------------------------
do $$
declare
  j jsonb;
begin
  update public.training_requirements set created_at = now() - interval '20 days' where id = (select v::uuid from _dt where k = 'req');
  delete from public.notifications where type = 'training_due';
  j := private.run_document_training_jobs();
  assert exists (select 1 from public.notifications where type = 'training_due' and recipient_id = '00000000-0000-4000-a000-000000000003'),
    'Leyla (missing) is reminded';
  assert exists (select 1 from public.notifications where type = 'training_due' and recipient_id = '00000000-0000-4000-a000-000000000001'),
    'Anna (due soon) is reminded';
  assert not exists (select 1 from public.notifications where type = 'training_due' and recipient_id = '00000000-0000-4000-a000-000000000002'),
    'Jonas (valid) is not reminded';
  j := private.run_document_training_jobs();
  assert (j ->> 'training_reminders')::int = 0, 'no second reminder right away';
end;
$$;

-- -----------------------------------------------------------------------------
-- B3. Direct writes are not possible
-- -----------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'mira', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    insert into public.training_completions (hospital_id, requirement_id, employee_id, completed_on)
    values ('10000000-0000-4000-a000-000000000001', (select v::uuid from _dt where k = 'req'), '40000000-0000-4000-a000-000000000003', current_date);
    raise exception 'direct insert must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.document_acknowledgements (hospital_id, document_id, employee_id)
    values ('10000000-0000-4000-a000-000000000001', (select v::uuid from _dt where k = 'sop2'), '40000000-0000-4000-a000-000000000003');
    raise exception 'direct confirmation must fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;

\o
\echo '  ✓ Dokumente / Fortbildungen assertions passed'
