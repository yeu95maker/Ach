# Imba – Property Marketplace (MVP)

A mobile-first property marketplace: **Wohnungen / apartments, Häuser / houses, Grundstücke / land and Gewerbe / commercial** from **verified providers only**. Launch market: Harare, Zimbabwe. Freemium + Premium membership.

> **Discover · Trust · Connect.** Open app → choose type → where → price → browse (list or map) → open property → save or message a verified provider.

The product name "Imba" ("house" in Shona) is a placeholder and can be changed in `src/lib/brand.ts`.

| Area | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router, Server Components), TypeScript strict, Tailwind CSS 4 |
| Backend | Supabase: Postgres + Row Level Security, Auth, Storage, Realtime |
| Maps | MapLibre GL rendering **Mapbox** tiles (`NEXT_PUBLIC_MAPBOX_TOKEN`); OpenStreetMap fallback for development |
| Payments | Provider-agnostic billing layer + demo checkout (see below) |
| i18n | English (default) and German; compile-time key parity |

## What is in the MVP

**Customers**
- Home: category tiles, "Where?" (suburb suggestions), price range, *Search* / *Search on map*
- Search results with list ↔ map toggle, category chips, sort, "load more"
- Filters: type, country/city/area, price, size, bedrooms, bathrooms; **Premium**: features (garage, garden, pool…), living area, parking, "listed within"
- Map: price markers, tap for preview, markers follow the visible area, **Search this area**
- Property page: swipe gallery (1 / 12), main information, features, description, surrounding area (approximate-location circle + nearby schools/shops/hospitals/roads), provider block, listed / last-confirmed dates, *Save*, *Report listing*
- In-app messaging only (no phone/WhatsApp): one conversation per property and customer, property attached to the chat, quick replies, realtime with polling fallback, unread badges
- Saved properties (Free: 10, Premium: unlimited), saved searches with alerts (Premium), notifications (saved-search matches, price drops, sold/removed favourites)
- Membership page with the plan comparison; locked "members only" and "early access" teasers

**Providers (Anbieter)**
- Onboarding: public profile → verification (legal name, phone, email, ID type/number, business registration, agent licence, document upload to a private bucket) → admin review
- Unverified providers can prepare drafts but **cannot publish**
- 9-step listing wizard: type → location (map pin, exact/approximate) → price → size → details & features → photos (client-side downscaling, reorder, cover) → description & nearby places → preview → submit for moderation
- Dashboard: views, inquiries, saves per listing, status, moderation notes, *mark sold*, *remove*, *still available?* prompt after 30 days
- Public provider profile with all active listings

**Admin** (`/admin`, `profiles.is_admin`)
- Overview with the MVP success metrics (supply, demand, marketplace, trust, revenue)
- Provider verification (with signed links to documents), suspend / reinstate
- Listing moderation: approve (optionally with 48 h Premium early access), reject with reason, remove, restore, mark members-only
- Reports: remove listing / resolve / dismiss
- Users: search, suspend, grant / revoke Premium

## Trust & security design

- **Every listing goes through the database API**, never through a public table read. `search_properties` / `get_property` (security definer) strip price, title, description, gallery and provider from members-only / early-access listings for non-premium users. Locked listings are excluded whenever a price filter is set, so prices cannot be narrowed down by repeated searches.
- **Approximate location**: the public position is snapped to a ~550 m grid plus a stable per-listing offset unless the provider opts in to the exact location. Exact coordinates are only readable by the owner and admins.
- Status changes are guarded by triggers: providers cannot self-verify, publish, mark listings premium or edit view counters; only allowed transitions (draft → pending → …) are possible.
- Provider contact data never leaves the verification table; all customer–provider communication is in-app.
- "Verified Provider" is explained on every listing: it means the provider passed verification – **not** a guarantee of ownership or title.
- Rate-limited view counting (one per viewer per day), one open report per user and listing, free-tier favourites limit, suspended accounts cannot message or list.

## Billing

The database owns the lifecycle *Free → Premium → Renewal → Cancellation → Expiration* (`memberships`, `payments`):

| Function | Caller |
| --- | --- |
| `billing_record_payment` (idempotent per provider reference) | payment webhook, service role |
| `billing_mark_status` (past_due / expired) | payment webhook, service role |
| `cancel_membership` / `resume_membership` | user (cancel at period end) |
| `expire_memberships`, `request_availability_confirmations` | cron, service role |
| `billing_demo_checkout` | user, only if `app_settings.demo_billing = true` |

`BILLING_PROVIDER=demo` activates Premium without payment (development/staging). To launch, implement the `PaymentAdapter` interface in `src/lib/billing/index.ts` (hosted checkout + verified webhook → `/api/billing/webhook`). **Which provider is an open decision** – for Zimbabwe customers typically pay with EcoCash / OneMoney / ZimSwitch or USD cards, so a local gateway (e.g. Paynow) is likely needed; Stripe fits other markets. Keep `demo_billing` **off** in production.

## Getting started

```bash
cd marketplace
npm install
supabase start && supabase db reset     # applies supabase/migrations + seed.sql
cp .env.example .env.local              # URL + anon key from `supabase status`, optional Mapbox token
npm run dev                             # http://localhost:3000
```

Demo accounts (password `Marketplace!2026`):

| Email | Role |
| --- | --- |
| `admin@demo.property` | Admin |
| `tariro@demo.property` | Customer (Free) |
| `farai@demo.property` | Customer (Premium, saved search) |
| `lena@demo.property` | Customer (Premium, cancelled, German UI) |
| `abc@demo.property` | Verified agent "ABC Properties" |
| `kudzi@demo.property` | Verified private seller |
| `sunrise@demo.property` | Verified developer |
| `newagent@demo.property` | Provider with pending verification |

Cron jobs to schedule in production (e.g. `pg_cron`, daily): `select public.expire_memberships();` and `select public.request_availability_confirmations(30);`.

## Quality checks

```bash
npm run check        # typecheck + ESLint + unit tests (filters, formatting, wizard validation, i18n parity)
npm run test:db      # migrations + seed + SQL test suite against plain PostgreSQL (PG* env vars)
```

`test:db` needs no Docker: `supabase/tests/support/supabase_shim.sql` recreates the Supabase roles, `auth.uid()`, storage and realtime publication. The suites cover visibility and premium locking, price-probing protection, provider verification gating, protected columns, messaging isolation, favourites limit, view counting, reports, billing lifecycle, admin moderation, saved-search and price-drop alerts, suspension and the listing wizard RPC.

Browser journeys without Docker (`scripts/e2e`): `gateway.mjs` is a minimal stand-in for the Supabase API that runs every request with real RLS; `journeys.mjs` (Playwright) walks discovery → map → property → locked listing → sign-up → save → message → demo Premium → provider wizard with photo upload → admin approval → listing public → provider reply → German UI, taking phone screenshots.

```bash
SKIP_TESTS=1 ./scripts/db-test.sh
PGDATABASE=marketplace_test node scripts/e2e/gateway.mjs &
npm run build && npx next start -p 3000 &
node scripts/e2e/journeys.mjs screenshots
```

## Open points / next steps

- Choose and integrate the payment provider for the launch market (adapter + webhook are prepared).
- Mapbox token (URL-restricted) for production; optionally Mapbox geocoding for the "Where?" field.
- Email/push delivery of notifications (currently in-app).
- Property/document verification as a separate, explicit badge (not part of the MVP by design).
- Image moderation and EXIF stripping of uploaded photos.
- Not built on purpose: auctions, mortgages, in-app payments for property, AI valuation, rentals, international markets.

## Structure

```
src/app/            routes (home, search, properties, providers, saved, messages, membership,
                    profile, notifications, provider/*, admin, auth, api/billing/webhook)
src/components/     UI (cards, map, filters, wizard, chat, admin actions, ui primitives)
src/lib/            filters, formatting, locations, listing validation, billing, i18n, Supabase clients
supabase/migrations schema · logic/triggers · RLS/storage · API functions
supabase/seed.sql   Harare demo data (images in public/demo, generated by scripts/demo-images.mjs)
supabase/tests/     SQL test suites + Supabase shim
```
