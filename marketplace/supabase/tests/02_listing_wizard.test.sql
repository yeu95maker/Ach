-- =============================================================================
-- save_property(): atomic create/update from the listing wizard
-- =============================================================================
\o /dev/null
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

begin;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000003');  -- Sunrise Developers (verified)
do $$
declare
  v_id uuid;
  d jsonb;
  pfx text := 'd0000000-0000-4000-8000-000000000003/';
begin
  v_id := public.save_property(
    '{"category":"house","title":"New Show House","country":"Zimbabwe","city":"Harare","area":"Greendale",
      "latitude":-17.81,"longitude":31.12,"price":150000,"land_size_m2":600,"living_area_m2":200,"bedrooms":3,"bathrooms":2}',
    array['garage','garden']::public.property_feature[], array[pfx || 'x/1.jpg', pfx || 'x/2.jpg'],
    '[{"kind":"school","name":"Greendale Primary","distance_m":800},{"kind":"other","name":"  ","distance_m":5}]', false);
  d := public.get_my_property(v_id);
  assert d ->> 'status' = 'draft', 'saved as draft';
  assert jsonb_array_length(d -> 'images') = 2 and jsonb_array_length(d -> 'features') = 2 and jsonb_array_length(d -> 'nearby') = 1, 'children saved';
  assert d -> 'images' ->> 0 = pfx || 'x/1.jpg', 'image order kept';

  perform public.save_property(d || '{"price":145000}', array['garage']::public.property_feature[], array[pfx || 'x/2.jpg'], '[]', true);
  d := public.get_my_property(v_id);
  assert d ->> 'status' = 'pending' and (d ->> 'price')::numeric = 145000, 'submitted';
  assert jsonb_array_length(d -> 'images') = 1 and jsonb_array_length(d -> 'nearby') = 0, 'children replaced';

  begin
    perform public.save_property(d, null, array['d0000000-0000-4000-8000-000000000001/stolen.jpg'], '[]', true);
    raise exception 'foreign image path accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_property(public.get_my_property('e0000000-0000-4000-8000-000000000001'), null, null, '[]', true);
    raise exception 'foreign listing saved';
  exception when others then
    if sqlerrm = 'foreign listing saved' then raise; end if;
  end;
end $$;
rollback;

begin;
select pg_temp.act_as('b0000000-0000-4000-8000-000000000004');  -- Banda Realty (pending verification)
do $$ begin
  perform public.save_property('{"category":"land","title":"Stand in Msasa","country":"Zimbabwe","city":"Harare","area":"Msasa",
      "latitude":-17.84,"longitude":31.12,"price":20000,"land_size_m2":500}', null, null, '[]', true);
  raise exception 'unverified provider submitted';
exception when others then
  if position('PROVIDER_NOT_VERIFIED' in sqlerrm) = 0 then raise; end if;
end $$;
rollback;

\o
\echo '  ✓ listing wizard tests'
