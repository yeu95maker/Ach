-- =============================================================================
-- Push-Versand: Geheimnis für push-dispatch, Auslöser ohne pg_net / URL
-- =============================================================================
\o /dev/null
\set anna '00000000-0000-4000-a000-000000000001'

do $$
declare
  s text := (select value from private.app_settings where name = 'push_dispatch_secret');
begin
  assert s ~ '^[0-9a-f]{64}$', 'random 256-bit secret';
  assert public.verify_push_dispatch_secret(s), 'correct secret accepted';
  assert not public.verify_push_dispatch_secret('wrong'), 'wrong secret rejected';
  assert not public.verify_push_dispatch_secret(''), 'empty rejected';
  assert not public.verify_push_dispatch_secret(null), 'null rejected';
  -- without functions_url (and here without pg_net) the trigger is a no-op
  perform private.trigger_push_dispatch();
end;
$$;

-- Signed-in users can neither read the secret nor probe it
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'anna', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform 1 from private.app_settings;
    raise exception 'users must not read app_settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.verify_push_dispatch_secret('x');
    raise exception 'users must not call verify_push_dispatch_secret';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.trigger_push_dispatch();
    raise exception 'users must not trigger dispatch';
  exception when insufficient_privilege then null;
  end;
end;
$$;
commit;

\o
\echo '  ✓ Push-Versand assertions passed'
