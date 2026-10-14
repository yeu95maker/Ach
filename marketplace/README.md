# Property Finder (MVP)

A mobile-first property marketplace: **Wohnungen / apartments, Häuser / houses, Grundstücke / land and Gewerbe / commercial** from **verified providers only**. Launch market: Harare, Zimbabwe. Freemium + Premium membership.

> **Discover · Trust · Connect.** Open app → choose type → where → price → browse (list or map) → open property → save or message a verified provider.

The product name is set in `src/lib/brand.ts`. **How to get real Zimbabwean listings into the app:** see [docs/REAL-LISTINGS.md](docs/REAL-LISTINGS.md).

| Area | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router, Server Components), TypeScript strict, Tailwind CSS 4 |
| Backend | Supabase: Postgres + Row Level Security, Auth, Storage, Realtime |
| Maps | MapLibre GL rendering **Mapbox** tiles (`NEXT_PUBLIC_MAPBOX_TOKEN`); OpenStreetMap fallback for development |
| Payments | Paynow – EcoCash, OneMoney, Visa/Mastercard, ZimSwitch (see below) |
| i18n | English (default) and German; compile-time key parity |

## What is in the MVP

**Customers**
- **Buy or rent**: houses, apartments, land, commercial – and rooms to let; monthly rent, additional costs, deposit, move-in date
- **Radius search** ("within 3 km of Avondale" or near my location) and map clustering at city zoom
- Home: category tiles, "Where?" (suburb suggestions), price range, *Search* / *Search on map*
- Search results with list ↔ map toggle, category chips, sort, "load more"
- Filters: type, country/city/area, price, size, bedrooms, bathrooms; **Premium**: features (garage, garden, pool…), living area, parking, "listed within"
- Map: price markers, tap for preview, markers follow the visible area, **Search this area**
- Property page: swipe gallery (1 / 12), main information, features, description, surrounding area (approximate-location circle + nearby schools/shops/hospitals/roads), provider block, listed / last-confirmed dates, *Save*, *Report listing*
- In-app messaging only (no phone/WhatsApp): one conversation per property and customer, property attached to the chat, quick replies, realtime with polling fallback, unread badges
- Saved properties (Free: 10, Premium: unlimited), saved searches with alerts (Premium), notifications (saved-search matches, price drops, sold/removed favourites)
- Membership page with the plan comparison; locked "members only" and "early access" teasers

**Providers (Anbieter)**
- **Bulk import** of existing stock from a spreadsheet (CSV → drafts, then photos + pin + submit)
- Onboarding: public profile → verification (legal name, phone, email, ID type/number, business registration, agent licence, document upload to a private bucket) → admin review
- Unverified providers can prepare drafts but **cannot publish**
- 9-step listing wizard: sale or rent + type → location (street address, *Find on map* geocoding, map pin, exact/approximate) → price → size → details & features → photos (client-side downscaling, reorder, cover) → description & nearby places → preview → submit for moderation
- Dashboard: views, inquiries, saves per listing, status, moderation notes, *mark sold*, *remove*, *still available?* prompt after 30 days
- Public provider profile with all active listings

**SEO & sharing**
- Server-rendered property pages with canonical URL, Open Graph/Twitter previews and schema.org `RealEstateListing` data; members-only teasers and non-public pages are `noindex`
- Indexable landing pages `/buy|rent/<type>/<place>` (e.g. `/rent/apartments/harare`, `/buy/land/borrowdale`) with nearby-area links; unknown combinations 404, empty ones are `noindex`
- `sitemap.xml` (home, landing pages, every public listing) and `robots.txt` (private areas excluded) – set `APP_URL` to the public domain

**Trust & privacy**
- Risk flags on listings in moderation (copied description, same title/area as another provider, price far below similar listings, brand-new provider, open reports, few photos, earlier removals); the review queue is sorted by risk
- Immutable audit log of every administrator change (who, what, before → after, IP) – Admin → *Audit log*
- GDPR self-service in Profile: download all personal data (JSON), delete the account (payment records are kept anonymised for accounting)
- Providers can pause/resume live listings and duplicate a listing into a new draft

**Agency teams & email**
- Providers invite agents/admins by email (*My properties → Team*); members share the agency's listings, photos and inbox; only the owner manages profile and verification; the invite link works only for the invited address (14 days)
- Email notifications for new inquiries, new messages (max. one per conversation every 30 min), saved-search matches, price drops, listing decisions and team invites – in the recipient's language, switchable in Profile
- Emails are queued in `email_outbox` and sent by `/api/cron/emails` (Vercel cron every 5 min via `vercel.json`, or any scheduler with `Authorization: Bearer $CRON_SECRET`); failures are retried up to 3 times

**Growth (provider acquisition)**
- `/for-providers` landing page for agents, developers and sellers – the link you share on WhatsApp
- Partner referral codes: `/for-providers?ref=HRE-TINO` remembers the code and pre-fills it when the provider profile is created; the code is fixed after sign-up
- Admin → *Partners*: create codes, copy each partner's link, see signed-up / verified / **qualified** providers (verified with ≥ 5 active listings – the basis for paying field partners)
- *Founding Provider* badge (set by admins) on listings, property pages and provider profiles

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

## Payments (Paynow)

Premium is paid through **[Paynow](https://www.paynow.co.zw)**, Zimbabwe's main payment gateway:
**EcoCash** and **OneMoney** (PIN prompt on the customer's phone, no redirect) and **Visa / Mastercard / ZimSwitch** and other wallets via the Paynow checkout page. Prices come from `app_settings` (default USD 9 / month, USD 90 / year).

How it works:

1. `POST /api/billing/checkout` (signed-in user) books a *pending* payment (amount taken from the database, never from the browser) and starts the Paynow transaction.
2. Paynow posts the result to `/api/billing/paynow/result`; the customer's return page also polls `/api/billing/status`. Both only trust Paynow's **signed poll URL** that the server stored itself, check the SHA-512 hash and that the paid amount matches.
3. `billing_record_payment` settles the payment idempotently and extends Premium by one month/year. A declined or cancelled payment is marked failed; nothing is activated.

Paynow has no stored-card subscriptions, so Premium is **prepaid**: it is valid until the end date and the member extends it themselves ("Extend Premium"; a new payment adds a period on top). The schema also supports auto-renewing providers (`memberships.auto_renew`, cancel/resume) if a card provider is added for other markets.

**Go live with Paynow:**
1. Create a Paynow merchant account → *Receive Payments* → new integration (USD).
2. Set `BILLING_PROVIDER=paynow`, `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_URL` (public HTTPS URL), and run `update public.app_settings set demo_billing = false;`.
3. Test in Paynow test mode (set `PAYNOW_TEST_AUTH_EMAIL` to your merchant email; test numbers 0771111111 = success, 0773333333 = cancelled), then ask Paynow to set the integration live and remove `PAYNOW_TEST_AUTH_EMAIL`.
4. Daily cron: `select public.billing_expire_pending(24);` (closes abandoned payments).

`BILLING_PROVIDER=demo` activates Premium without payment (development only).

## Email setup

1. Create a [Resend](https://resend.com) account and verify your sending domain.
2. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM="Property Finder <hello@your-domain>"`, `CRON_SECRET` (a long random string) and `SUPABASE_SERVICE_ROLE_KEY`.
3. On Vercel the cron in `vercel.json` calls the worker every 5 minutes. Elsewhere, call `GET /api/cron/emails` with `Authorization: Bearer $CRON_SECRET`.
Without `EMAIL_PROVIDER` emails simply stay queued; `EMAIL_PROVIDER=log` prints them (development).

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

Cron jobs to schedule in production (e.g. `pg_cron`, daily): `select public.expire_memberships();`, `select public.request_availability_confirmations(30);` and `select public.billing_expire_pending(24);`.

**Production:** `supabase/seed.sql` is demo data only – never load it into the production database (`supabase db push` applies migrations only). Create the first admin by setting `profiles.is_admin = true` for your account in the SQL editor.

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

Payments end to end: start `PAYNOW_INTEGRATION_KEY=test-key node scripts/e2e/paynow-mock.mjs`, run the app with `BILLING_PROVIDER=paynow PAYNOW_INTEGRATION_ID=1201 PAYNOW_INTEGRATION_KEY=test-key PAYNOW_BASE_URL=http://localhost:4010 SUPABASE_SERVICE_ROLE_KEY=$(node scripts/e2e/gateway.mjs --print-service-key) APP_URL=http://localhost:3000` and the journeys with `PAYNOW_E2E=1` (EcoCash success, card redirect, declined payment).

## Open points / next steps

- Paynow merchant account + live integration keys (code is complete and tested against a protocol-compatible mock).
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
