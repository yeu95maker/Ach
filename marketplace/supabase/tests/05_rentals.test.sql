-- =============================================================================
-- Rentals, richer details, radius search
-- =============================================================================
\o /dev/null
begin;
set local role anon;
do $$
declare r jsonb;
begin
  assert (public.search_properties('{"transaction":"rent"}') ->> 'total')::int = 5, 'five rentals';
  assert (public.search_properties('{"transaction":"sale"}') ->> 'total')::int = 16, 'sales unchanged';
  assert (public.search_properties('{"transaction":"rent","max_price":700}') ->> 'total')::int = 2, 'rent up to $700/month';
  assert (public.search_properties('{"category":"room"}') ->> 'total')::int = 1, 'rooms';
  assert (public.search_properties(jsonb_build_object('transaction', 'rent', 'available_by', current_date + 10)) ->> 'total')::int = 3, 'move-in by date';

  -- Radius: 2 km around Avondale centre finds the Avondale listings, not Borrowdale
  r := public.search_properties('{"near":[-17.8,31.037],"radius_km":2}');
  assert exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'id' = 'e0000000-0000-4000-8000-000000000101'), 'flat within 2 km';
  assert not exists (select 1 from jsonb_array_elements(r -> 'items') i where i ->> 'area' = 'Borrowdale'), 'Borrowdale outside 2 km';
  assert (public.search_properties('{"near":[-17.8,31.037],"radius_km":20}') ->> 'total')::int > (r ->> 'total')::int, 'wider radius finds more';

  r := public.get_property('e0000000-0000-4000-8000-000000000101');
  assert r ->> 'transaction' = 'rent' and (r ->> 'deposit')::numeric = 650 and (r ->> 'additional_costs')::numeric = 40, 'rent details';
  assert (r ->> 'floor')::int = 2 and (r ->> 'year_built')::int = 2012 and r ->> 'condition' = 'renovated', 'building details';
  assert r -> 'street_address' = 'null'::jsonb, 'street address hidden while location is approximate';
end $$;
rollback;

begin;
set local role anon;
do $$ begin
  assert (public.search_properties('{"transaction":"rent"}') ->> 'total')::int = 5, 'five rentals';
  assert public.get_property('e0000000-0000-4000-8000-000000000101') -> 'street_address' = 'null'::jsonb, 'street address hidden';
end $$;
rollback;

-- Owner sees the street address; save_property stores rent fields
begin;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_id uuid;
begin
  assert public.get_property('e0000000-0000-4000-8000-000000000101') ->> 'street_address' = '12 King George Rd', 'owner sees address';
  v_id := public.save_property('{"category":"room","transaction":"rent","title":"Room near UZ","country":"Zimbabwe","city":"Harare","area":"Mount Pleasant",
      "latitude":-17.77,"longitude":31.05,"price":150,"living_area_m2":12,"deposit":150,"additional_costs":10,"available_from":"2026-11-01",
      "floor":1,"year_built":1990,"condition":"good","street_address":"5 Churchill Ave"}', array['furnished','pets_allowed']::public.property_feature[], null, '[]', false);
  assert (select transaction = 'rent' and deposit = 150 and available_from = '2026-11-01' and street_address = '5 Churchill Ave' and condition = 'good'
          from public.properties where id = v_id), 'rent fields saved';
end $$;
rollback;
\o
\echo '  ✓ rental tests'
