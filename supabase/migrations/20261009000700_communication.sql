-- =============================================================================
-- ShiftCare · 0700 · Communication: notifications, push delivery, announcements
--
-- notifications           one row per recipient (in-app inbox, realtime)
--   └─ notification_deliveries  outbound queue per device/channel (push, e-mail)
-- device_tokens           registered push endpoints (Web Push, APNs, FCM)
-- announcements           hospital- or ward-wide messages
--
-- Notifications store a TYPE + PAYLOAD, never rendered text. The client renders
-- them in the user's language, so adding a language never touches stored data.
-- =============================================================================

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  type         public.notification_type not null,
  payload      jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  entity_type  text check (entity_type ~ '^[a-z_]+$'),
  entity_id    uuid,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;

-- -----------------------------------------------------------------------------
create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  platform     public.device_platform not null,
  token        text not null check (char_length(token) <= 2048),  -- FCM/APNs token or Web Push endpoint
  web_push_keys jsonb,                                            -- { p256dh, auth } for Web Push
  device_name  text check (char_length(device_name) <= 120),
  app_version  text check (char_length(app_version) <= 40),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (token),
  check (platform <> 'web' or web_push_keys ? 'p256dh' and web_push_keys ? 'auth')
);

create index device_tokens_user_idx on public.device_tokens (user_id);

-- -----------------------------------------------------------------------------
create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  device_token_id uuid references public.device_tokens (id) on delete cascade,
  channel         public.delivery_channel not null default 'push',
  status          public.delivery_status not null default 'queued',
  attempts        integer not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

comment on table public.notification_deliveries is
  'Outbound queue processed by the push-dispatch Edge Function (service role only).';

create index notification_deliveries_queue_idx on public.notification_deliveries (created_at) where status = 'queued';
create index notification_deliveries_notification_idx on public.notification_deliveries (notification_id);

-- -----------------------------------------------------------------------------
create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals (id) on delete cascade,
  unit_id      uuid,                         -- NULL = whole hospital
  title        text not null check (char_length(title) between 1 and 200),
  body         text not null check (char_length(body) between 1 and 10000),
  priority     public.announcement_priority not null default 'normal',
  published_at timestamptz,                  -- NULL = draft
  expires_at   timestamptz,
  author_id    uuid references public.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hospital_id, id),
  check (expires_at is null or published_at is null or expires_at > published_at),
  foreign key (hospital_id, unit_id) references public.units (hospital_id, id) on delete cascade
);

create index announcements_feed_idx on public.announcements (hospital_id, published_at desc) where published_at is not null;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function private.set_updated_at();
