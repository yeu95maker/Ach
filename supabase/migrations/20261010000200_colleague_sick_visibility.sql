-- =============================================================================
-- ShiftCare · 1400 · Colleagues may see WHO is sick (not why), never vacation
--
-- Decision (product owner, 2026-10-10): colleagues may see that a colleague is
-- sick, but not that a colleague is on vacation.
--
-- Exposed through a dedicated view instead of widening the sick_leaves RLS:
--   * only active sick periods (reported / acknowledged)
--   * only colleagues sharing at least one ward with the caller
--   * only employee + period – no comment, no status, no certificate, no actor
-- Vacation (leave_requests) stays visible to the employee and leave managers only.
-- =============================================================================

create or replace view public.colleague_sick_leaves
with (security_barrier = true)
as
select
  sl.id,
  sl.hospital_id,
  sl.employee_id,
  sl.start_date,
  sl.end_date
from public.sick_leaves sl
where sl.status in ('reported', 'acknowledged')
  and sl.hospital_id in (select private.hospitals_with_any_permission('team.view'))
  and exists (
    select 1
    from public.employee_units eu
    where eu.employee_id = sl.employee_id
      and eu.unit_id in (select private.my_unit_ids())
  );

comment on view public.colleague_sick_leaves is
  'Who on my wards is sick, and for which period. Intentionally no reason/comment and no vacation data.';

revoke all on public.colleague_sick_leaves from anon;
grant select on public.colleague_sick_leaves to authenticated;

create index if not exists sick_leaves_active_period_idx
  on public.sick_leaves (hospital_id, end_date) where status in ('reported', 'acknowledged');
