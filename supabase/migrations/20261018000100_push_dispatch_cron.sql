-- =============================================================================
-- Dienstwerk · Push-Versand automatisch anstoßen
--
-- pg_cron ruft jede Minute die Edge Function push-dispatch auf, solange Push-
-- Zustellungen warten. Die Function erkennt den Aufruf an einem zufälligen
-- Geheimnis, das nur in der Datenbank liegt (private.app_settings, für
-- Benutzer unlesbar) und von der Function per service-role-RPC geprüft wird –
-- der service-role-Schlüssel muss dafür nirgends hinterlegt werden.
--
-- Pro Projekt einmal die Basis-URL setzen (sonst passiert nichts):
--   insert into private.app_settings (name, value)
--   values ('functions_url', 'https://<ref>.supabase.co/functions/v1')
--   on conflict (name) do update set value = excluded.value;
-- =============================================================================

create table if not exists private.app_settings (
  name  text primary key,
  value text not null
);
revoke all on private.app_settings from public, anon, authenticated;

insert into private.app_settings (name, value)
values ('push_dispatch_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- Called by push-dispatch with the service-role client.
create or replace function public.verify_push_dispatch_secret(p_secret text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from private.app_settings where name = 'push_dispatch_secret' and value = p_secret);
$$;
revoke execute on function public.verify_push_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.verify_push_dispatch_secret(text) to service_role;

-- Fires push-dispatch when native/web pushes are waiting. No-op without pg_net
-- or without a configured functions_url.
create or replace function private.trigger_push_dispatch()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_settings where name = 'functions_url');
  v_secret text := (select value from private.app_settings where name = 'push_dispatch_secret');
begin
  if v_url is null or v_secret is null or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  if not exists (select 1 from public.notification_deliveries
                 where status = 'queued' and channel = 'push' and created_at > now() - interval '1 day') then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    using rtrim(v_url, '/') || '/push-dispatch',
          jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
          '{}'::jsonb;
end;
$$;
revoke execute on function private.trigger_push_dispatch() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dienstwerk-push-dispatch', '* * * * *', 'select private.trigger_push_dispatch()');
  end if;
end;
$$;
