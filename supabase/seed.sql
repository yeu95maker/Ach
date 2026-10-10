-- =============================================================================
-- ShiftCare · Development seed (local `supabase db reset` only – never production)
--
-- Two hospitals so tenant isolation can be verified by hand and in tests.
-- All accounts use the password:  ShiftCare!2026
--
--   Klinikum Musterstadt
--     anna.becker@shiftcare.dev     Pflegekraft            Station 3A
--     jonas.weber@shiftcare.dev     Pflegekraft + Schichtleitung  Station 3A
--     leyla.yilmaz@shiftcare.dev    Pflegekraft            Station 3A
--     mira.schulz@shiftcare.dev     Stationsleitung        Station 3A
--     paul.richter@shiftcare.dev    Pflegedienstleitung    Innere Medizin
--     hanna.koch@shiftcare.dev      HR                     –
--     admin@shiftcare.dev           Hospital-Admin         –
--   St. Marien Krankenhaus
--     tom.fischer@shiftcare.dev     Pflegekraft            Station 2
--     lisa.wagner@shiftcare.dev     Stationsleitung        Station 2
--   Platform
--     ops@shiftcare.dev             System Administrator
-- =============================================================================

do $$
declare
  pw text := extensions.crypt('ShiftCare!2026', extensions.gen_salt('bf'));
  u  record;
begin
  for u in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'anna.becker@shiftcare.dev',  'Anna',  'Becker'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'jonas.weber@shiftcare.dev',  'Jonas', 'Weber'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'leyla.yilmaz@shiftcare.dev', 'Leyla', 'Yılmaz'),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'mira.schulz@shiftcare.dev',  'Mira',  'Schulz'),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'paul.richter@shiftcare.dev', 'Paul',  'Richter'),
      ('00000000-0000-4000-a000-000000000006'::uuid, 'hanna.koch@shiftcare.dev',   'Hanna', 'Koch'),
      ('00000000-0000-4000-a000-000000000007'::uuid, 'admin@shiftcare.dev',        'Sven',  'Admin'),
      ('00000000-0000-4000-a000-000000000008'::uuid, 'tom.fischer@shiftcare.dev',  'Tom',   'Fischer'),
      ('00000000-0000-4000-a000-000000000009'::uuid, 'lisa.wagner@shiftcare.dev',  'Lisa',  'Wagner'),
      ('00000000-0000-4000-a000-000000000010'::uuid, 'ops@shiftcare.dev',          'Olivia','Ops')
    ) as t(id, email, first_name, last_name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, pw, now(),
            '', '', '', '',
            '{"provider":"email","providers":["email"]}',
            jsonb_build_object('first_name', u.first_name, 'last_name', u.last_name, 'locale', 'de'),
            now(), now());

    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end;
$$;

update public.users set phone = '+49 151 2345678' where id = '00000000-0000-4000-a000-000000000001';
update public.users set phone = '+49 160 9876543' where id = '00000000-0000-4000-a000-000000000004';

insert into public.user_languages (user_id, language_code, proficiency) values
  ('00000000-0000-4000-a000-000000000001', 'de', 'native'),
  ('00000000-0000-4000-a000-000000000001', 'en', 'fluent'),
  ('00000000-0000-4000-a000-000000000002', 'de', 'native'),
  ('00000000-0000-4000-a000-000000000002', 'pl', 'intermediate'),
  ('00000000-0000-4000-a000-000000000003', 'de', 'fluent'),
  ('00000000-0000-4000-a000-000000000003', 'tr', 'native'),
  ('00000000-0000-4000-a000-000000000004', 'de', 'native'),
  ('00000000-0000-4000-a000-000000000004', 'ro', 'basic');

-- -----------------------------------------------------------------------------
-- Organisation
-- -----------------------------------------------------------------------------
insert into public.hospitals (id, name, slug) values
  ('10000000-0000-4000-a000-000000000001', 'Klinikum Musterstadt', 'klinikum-musterstadt'),
  ('10000000-0000-4000-a000-000000000002', 'St. Marien Krankenhaus', 'st-marien');

insert into public.departments (id, hospital_id, name, code) values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'Innere Medizin', 'INN'),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'Intensivmedizin', 'ITS'),
  ('20000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000002', 'Chirurgie', 'CHI');

insert into public.units (id, hospital_id, department_id, name, code) values
  ('30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', 'Station 3A · Kardiologie', '3A'),
  ('30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', 'Station 3B · Gastroenterologie', '3B'),
  ('30000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000002', 'Intensivstation 1', 'ITS1'),
  ('30000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000003', 'Station 2 · Unfallchirurgie', 'S2');

-- -----------------------------------------------------------------------------
-- Employees
-- -----------------------------------------------------------------------------
insert into public.employees (id, hospital_id, user_id, personnel_number, job_title, employment_type, weekly_hours, hire_date) values
  ('40000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'P-1001', 'Pflegefachfrau',                     'full_time', 38.5, '2019-04-01'),
  ('40000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'P-1002', 'Gesundheits- und Krankenpfleger',    'part_time', 30.0, '2021-09-15'),
  ('40000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', 'P-1003', 'Pflegefachfrau',                     'full_time', 38.5, '2022-01-01'),
  ('40000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', 'P-1004', 'Stationsleitung',                    'full_time', 38.5, '2015-06-01'),
  ('40000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000005', 'P-1005', 'Pflegedienstleitung',                'full_time', 40.0, '2012-02-01'),
  ('40000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006', 'V-2001', 'Personalreferentin',                 'full_time', 40.0, '2018-03-01'),
  ('40000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000007', 'V-2002', 'IT-Administration',                  'full_time', 40.0, '2017-01-01'),
  ('40000000-0000-4000-a000-000000000008', '10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000008', 'M-0101', 'Pflegefachmann',                     'full_time', 38.5, '2020-05-01'),
  ('40000000-0000-4000-a000-000000000009', '10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000009', 'M-0102', 'Stationsleitung',                    'full_time', 38.5, '2016-08-01');

insert into public.employee_units (hospital_id, employee_id, unit_id, is_primary) values
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', true),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001', true),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000003', false),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000001', true),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000004', '30000000-0000-4000-a000-000000000001', true),
  ('10000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000008', '30000000-0000-4000-a000-000000000004', true),
  ('10000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000009', '30000000-0000-4000-a000-000000000004', true);

-- Role assignments (scope: unit / department / hospital-wide)
-- head_nurse with unit scope = Stationsleitung, with department scope = PDL;
-- charge_nurse = Schichtleitung.
insert into public.employee_roles (hospital_id, employee_id, role_id, unit_id, department_id)
select a.hospital_id, a.employee_id, r.id, a.unit_id, a.department_id
from (values
  ('10000000-0000-4000-a000-000000000001'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, 'nurse',          null::uuid, null::uuid),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000002',       'nurse',          null,       null),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000003',       'nurse',          null,       null),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000002',       'charge_nurse',   '30000000-0000-4000-a000-000000000001'::uuid, null),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000004',       'head_nurse',     '30000000-0000-4000-a000-000000000001',       null),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000005',       'head_nurse',     null,       '20000000-0000-4000-a000-000000000001'::uuid),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000006',       'hr',             null,       null),
  ('10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000007',       'hospital_admin', null,       null),
  ('10000000-0000-4000-a000-000000000002',       '40000000-0000-4000-a000-000000000008',       'nurse',          null,       null),
  ('10000000-0000-4000-a000-000000000002',       '40000000-0000-4000-a000-000000000009',       'head_nurse',     '30000000-0000-4000-a000-000000000004', null)
) as a(hospital_id, employee_id, role_key, unit_id, department_id)
join public.roles r on r.key = a.role_key and r.hospital_id is null;

insert into public.platform_role_assignments (user_id, role_id)
select '00000000-0000-4000-a000-000000000010', id from public.roles where key = 'system_admin';

-- Qualifications
insert into public.qualifications (id, hospital_id, code, name) values
  ('50000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'ITS',  'Fachweiterbildung Intensiv & Anästhesie'),
  ('50000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'PA',   'Praxisanleitung'),
  ('50000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', 'WUND', 'Wundexperte ICW'),
  ('50000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000002', 'PA',   'Praxisanleitung');

insert into public.employee_qualifications (hospital_id, employee_id, qualification_id, acquired_on) values
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000002', '2021-03-01'),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', '50000000-0000-4000-a000-000000000001', '2023-07-01'),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', '50000000-0000-4000-a000-000000000003', '2024-02-01'),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000004', '50000000-0000-4000-a000-000000000002', '2016-01-01');

-- -----------------------------------------------------------------------------
-- Shift types
-- -----------------------------------------------------------------------------
insert into public.shift_types (id, hospital_id, code, name, category, start_time, end_time, break_minutes, sort_order) values
  ('60000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'F', 'Frühdienst',  'early', '06:00', '14:15', 30, 10),
  ('60000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'S', 'Spätdienst',  'late',  '13:45', '22:00', 30, 20),
  ('60000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', 'N', 'Nachtdienst', 'night', '21:45', '06:15', 45, 30),
  ('60000000-0000-4000-a000-000000000004', '10000000-0000-4000-a000-000000000002', 'F', 'Frühdienst',  'early', '06:30', '14:30', 30, 10),
  ('60000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000002', 'S', 'Spätdienst',  'late',  '14:00', '22:00', 30, 20),
  ('60000000-0000-4000-a000-000000000006', '10000000-0000-4000-a000-000000000002', 'N', 'Nachtdienst', 'night', '21:30', '06:45', 45, 30);

-- -----------------------------------------------------------------------------
-- Rosters: current month (published) and next month (draft), relative to today
-- Rotation F F S S N N – (never N → F, which would overlap)
-- -----------------------------------------------------------------------------
insert into public.schedules (id, hospital_id, unit_id, period_start, period_end) values
  ('70000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date),
  ('70000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   (date_trunc('month', current_date) + interval '1 month')::date, (date_trunc('month', current_date) + interval '2 months - 1 day')::date),
  ('70000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000004',
   date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);

with staff (schedule_id, hospital_id, employee_id, offset_days) as (
  values
    ('70000000-0000-4000-a000-000000000001'::uuid, '10000000-0000-4000-a000-000000000001'::uuid, '40000000-0000-4000-a000-000000000001'::uuid, 0),
    ('70000000-0000-4000-a000-000000000001',       '10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000002',       2),
    ('70000000-0000-4000-a000-000000000001',       '10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000003',       4),
    ('70000000-0000-4000-a000-000000000001',       '10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000004',       1),
    ('70000000-0000-4000-a000-000000000002',       '10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000001',       0),
    ('70000000-0000-4000-a000-000000000002',       '10000000-0000-4000-a000-000000000001',       '40000000-0000-4000-a000-000000000003',       4),
    ('70000000-0000-4000-a000-000000000003',       '10000000-0000-4000-a000-000000000002',       '40000000-0000-4000-a000-000000000008',       3),
    ('70000000-0000-4000-a000-000000000003',       '10000000-0000-4000-a000-000000000002',       '40000000-0000-4000-a000-000000000009',       0)
),
days as (
  select st.*, d::date as entry_date,
         (array['F','F','S','S','N','N','-'])[((d::date - s.period_start + st.offset_days) % 7) + 1] as code
  from staff st
  join public.schedules s on s.id = st.schedule_id
  cross join lateral generate_series(s.period_start, s.period_end, interval '1 day') d
)
insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date)
select d.hospital_id, d.schedule_id, d.employee_id,
       case when d.code = '-' then 'off' else 'shift' end::public.schedule_entry_kind,
       t.id, d.entry_date
from days d
left join public.shift_types t on t.hospital_id = d.hospital_id and t.code = d.code and d.code <> '-';

-- An open late shift in three days on Station 3A
insert into public.schedule_entries (hospital_id, schedule_id, employee_id, kind, shift_type_id, entry_date, note)
select '10000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001', null, 'shift',
       '60000000-0000-4000-a000-000000000002', least(current_date + 3, (date_trunc('month', current_date) + interval '1 month - 1 day')::date),
       'Springer gesucht';

-- Publishing creates the "new roster" notifications through the triggers.
update public.schedules set status = 'published', version = 1, published_at = now(),
       published_by = '00000000-0000-4000-a000-000000000004'
 where id in ('70000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000003');

-- -----------------------------------------------------------------------------
-- Absences
-- -----------------------------------------------------------------------------
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, comment) values
  ('80000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', 'vacation',
   (date_trunc('month', current_date) + interval '1 month 9 days')::date, (date_trunc('month', current_date) + interval '1 month 15 days')::date,
   'Familienbesuch'),
  ('80000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001', 'vacation',
   (date_trunc('month', current_date) + interval '2 months 2 days')::date, (date_trunc('month', current_date) + interval '2 months 12 days')::date,
   null),
  ('80000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000001', 'training',
   (date_trunc('month', current_date) + interval '2 months 20 days')::date, (date_trunc('month', current_date) + interval '2 months 21 days')::date,
   'Fortbildung Herzinsuffizienz');

update public.leave_requests
   set status = 'approved', decided_by = '00000000-0000-4000-a000-000000000004', decided_at = now(),
       decision_note = 'Viel Erholung!'
 where id = '80000000-0000-4000-a000-000000000002';

insert into public.sick_leaves (id, hospital_id, employee_id, start_date, end_date, comment_encrypted, reported_by)
values ('90000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003',
        current_date, current_date + 2, private.encrypt_text('Fieber, AU folgt'), '00000000-0000-4000-a000-000000000003');

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
insert into public.announcements (hospital_id, unit_id, title, body, priority, published_at, author_id) values
  ('10000000-0000-4000-a000-000000000001', null, 'Neue Hygienerichtlinie ab Montag',
   'Bitte beachtet die aktualisierte Händedesinfektions-Richtlinie im Intranet. Fragen gerne an das Hygieneteam.',
   'important', now() - interval '2 hours', '00000000-0000-4000-a000-000000000005'),
  ('10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'Teambesprechung 3A',
   'Donnerstag 14:30 im Stationszimmer – Themen: Urlaubsplanung und neue Monitore.',
   'normal', now() - interval '1 day', '00000000-0000-4000-a000-000000000004');

-- -----------------------------------------------------------------------------
-- Wunschplan
--   Station 3A · aktueller Monat: gesperrt, bereits bewertet (Historie)
--   Station 3A · nächster Monat: offen, Frist in 7 Tagen – Anna hat eingereicht
-- -----------------------------------------------------------------------------
insert into public.wish_plan_settings (hospital_id, unit_id, allow_edit_after_submit, deadline_days_before_period, reminder_days_before_deadline, max_free_wishes)
values ('10000000-0000-4000-a000-000000000001', null, true, 21, 3, 8);

insert into public.wish_periods (id, hospital_id, unit_id, period_start, period_end, deadline_at) values
  ('a0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, now() + interval '1 day'),
  ('a0000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
   (date_trunc('month', current_date) + interval '1 month')::date, (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
   (date_trunc('day', now() at time zone 'Europe/Berlin') + interval '7 days 23 hours 59 minutes') at time zone 'Europe/Berlin');

update public.wish_periods set status = 'open' where id in ('a0000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002');

insert into public.wish_submissions (id, hospital_id, period_id, employee_id, note) values
  ('b0000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000001',
   '40000000-0000-4000-a000-000000000001', null),
  ('b0000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'a0000000-0000-4000-a000-000000000002',
   '40000000-0000-4000-a000-000000000001', 'Am liebsten keine Nächte am Wochenende.');

insert into public.wish_entries (hospital_id, submission_id, period_id, employee_id, wish_date, preference_type, note, status, reviewed_at)
select '10000000-0000-4000-a000-000000000001', s.sub, s.period, '40000000-0000-4000-a000-000000000001', s.d, s.t, s.note, s.st::public.wish_status,
       case when s.st in ('considered', 'not_considered') then now() end
from (values
  ('b0000000-0000-4000-a000-000000000001'::uuid, 'a0000000-0000-4000-a000-000000000001'::uuid, date_trunc('month', current_date)::date + 11, 'free',  'Geburtstag', 'considered'),
  ('b0000000-0000-4000-a000-000000000001',       'a0000000-0000-4000-a000-000000000001',       date_trunc('month', current_date)::date + 19, 'early', null,         'not_considered'),
  ('b0000000-0000-4000-a000-000000000002',       'a0000000-0000-4000-a000-000000000002',       (date_trunc('month', current_date) + interval '1 month')::date + 4,  'free',        null,            'submitted'),
  ('b0000000-0000-4000-a000-000000000002',       'a0000000-0000-4000-a000-000000000002',       (date_trunc('month', current_date) + interval '1 month')::date + 5,  'free',        null,            'submitted'),
  ('b0000000-0000-4000-a000-000000000002',       'a0000000-0000-4000-a000-000000000002',       (date_trunc('month', current_date) + interval '1 month')::date + 11, 'night',       null,            'submitted'),
  ('b0000000-0000-4000-a000-000000000002',       'a0000000-0000-4000-a000-000000000002',       (date_trunc('month', current_date) + interval '1 month')::date + 17, 'unavailable', 'Arzttermin',    'submitted')
) as s(sub, period, d, t, note, st);

-- Current month: deadline passed → locked
update public.wish_periods set deadline_at = now() - interval '25 days', status = 'locked'
 where id = 'a0000000-0000-4000-a000-000000000001';
