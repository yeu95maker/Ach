# StandFinder in the App Store and Google Play

The iOS and Android apps are thin native shells (Capacitor, `capacitor.config.ts`)
around the live website. They load `APP_URL` and add native features on top:

| Native feature | Where |
| --- | --- |
| Share sheet for listings | `src/components/ShareButton.tsx`, `@capacitor/share` |
| Location for “Near me” search | `src/lib/native/client.ts`, `@capacitor/geolocation` |
| Universal links / app links (`/properties/…` opens in the app) | `src/app/.well-known/*`, `scripts/mobile/configure.mjs` |
| In-app browser for external links, Android back button, splash, status bar | `src/components/NativeBridge.tsx` |
| Camera / photo library for listing photos and verification documents | file inputs, `Info.plist` usage texts |
| Offline screen | `mobile/www/index.html` |

Because the apps load the website, **every website deploy updates the apps too** –
a new store build is only needed when native code, icons or permissions change.

Builds run on GitHub Actions – **no Mac needed**:
`.github/workflows/standfinder-release.yml` (iOS → TestFlight, Android → signed AAB / Play internal track).

---

## Before the first upload – decisions

1. **App name: StandFinder.** No property app with this name turned up in a web search (October 2026).
   Before the first upload, check that “StandFinder” is still free in App Store Connect
   (the name is reserved when you create the app record) and in the Play Console, and register
   the domain (e.g. `standfinder.co.zw`) and social handles. If the exact name is taken, use
   **“StandFinder Zimbabwe”** as the store name – the home-screen name stays “StandFinder”.
2. **App ID** `app.standfinder.zw` (in `capacitor.config.ts`, the native projects and
   `NATIVE_APP_ID` in `src/lib/native/index.ts`). It is permanent once uploaded. To change it,
   replace the string in those places and in `android/app/build.gradle` (`namespace`,
   `applicationId`), `ios/App/App.xcodeproj/project.pbxproj` (`PRODUCT_BUNDLE_IDENTIFIER`)
   and `.github/workflows/standfinder-release.yml` (`packageName`).
3. **Premium inside the apps.** Apple (3.1.1) and Google Play only allow selling digital
   memberships in apps via their own in-app purchase. The apps therefore **do not sell
   Premium**: the membership page shows “Premium is not available for purchase in the app”,
   and `/api/billing/checkout` refuses requests from the apps. Members who bought Premium on
   the website keep all benefits in the app. If you later want to sell in the app, add
   StoreKit / Play Billing (e.g. RevenueCat) – Apple and Google keep 15–30 %.
4. **Real listings first.** Reviewers reject empty or “demo” marketplaces (Apple 2.1, 4.2).
   Onboard providers and have at least 20–30 real, approved listings live before submitting.

## Step 1 – website live

1. Vercel project `property-finder` exists with the Supabase settings. Connect the GitHub
   repository once: Vercel → project → **Settings → Git → Connect** `yeu95maker/Ach`,
   **Root Directory** `marketplace`, **Production Branch** = the branch you release from.
2. In Vercel → **Settings → Environment Variables** add:
   - `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API keys → `service_role`/secret)
   - `APP_URL` = your final https URL (custom domain recommended, e.g. `https://standfinder.co.zw`)
   - `LEGAL_NAME`, `LEGAL_ADDRESS`, `SUPPORT_EMAIL` (shown on /privacy, /terms, /imprint, /support)
   - for payments: `BILLING_PROVIDER=paynow`, `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`
   - for emails: `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`
   - after the apps exist: `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256` (step 5)
3. Supabase → **Authentication → URL Configuration**: Site URL = `APP_URL`, add
   `APP_URL/**` to the redirect URLs.
4. Open `APP_URL/support`, `/privacy`, `/terms` – the stores link to them.

## Step 2 – developer accounts

- **Apple Developer Program** (99 USD/year). Create the app in App Store Connect → My Apps → “+”
  with the bundle ID from above (register it under Certificates, IDs & Profiles → Identifiers,
  capability **Associated Domains** on).
- **Google Play Console** (25 USD once). New personal accounts must run a **closed test with at
  least 12 testers for 14 days** before production access – start that early.

## Step 3 – iOS secrets (GitHub → Settings → Secrets and variables → Actions)

| Name | Type | Value |
| --- | --- | --- |
| `SF_APP_URL` | **Variable** | live https URL of the website (= `APP_URL`) |
| `APP_STORE_CONNECT_KEY_ID` | Secret | App Store Connect → Users and Access → Integrations → App Store Connect API → key (role *App Manager*) |
| `APP_STORE_CONNECT_ISSUER_ID` | Secret | Issuer ID on the same page |
| `APP_STORE_CONNECT_KEY` | Secret | full content of the downloaded `.p8` file |
| `APPLE_TEAM_ID` | Secret | developer.apple.com → Membership → Team ID |

(The App Store Connect secrets are the same names the Pulshift app uses – one Apple account can serve both.)

## Step 4 – Android upload key

1. Create a fine-grained GitHub token for this repository with **Secrets: Read and write** and
   store it as secret `GH_SECRETS_TOKEN`.
2. Actions → **“StandFinder – create Android upload key”** → Run. It stores
   `SF_ANDROID_KEYSTORE_BASE64`, `SF_ANDROID_KEYSTORE_PASSWORD`, `SF_ANDROID_KEY_ALIAS`.
3. Optional: a Google Cloud service account with Play Console access as
   `PLAY_SERVICE_ACCOUNT_JSON` → builds are uploaded automatically to internal testing.
   The very first AAB must be uploaded by hand in the Play Console.

> GitHub only lists manually started workflows that exist on the repository's **default branch** –
> merge this branch first (or set it as default).

## Step 5 – build and link

1. Actions → **“StandFinder – store release”** → Run (version `1.0.0`). It checks that the
   website is live, runs the tests, then builds both apps.
2. iOS: the build appears in TestFlight after 10–30 minutes.
   Android: AAB under *Artifacts* (or already in internal testing).
3. Deep links: set `APPLE_TEAM_ID` in Vercel, and `ANDROID_CERT_SHA256` = SHA-256 of the
   **app signing key** (Play Console → Test and release → Setup → App signing). Redeploy and check
   `APP_URL/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`.

## Step 6 – store listings

### Texts – English

- **Name:** StandFinder *(or “StandFinder Zimbabwe”, see decision 1)*
- **Subtitle (iOS, 30):** Stands, homes & rentals in Zim
- **Short description (Play, 80):** Buy or rent verified homes, stands and offices in Zimbabwe. Chat in-app.
- **Keywords (iOS, 100):** property,house,rent,stand,land,Harare,Bulawayo,apartment,real estate,Zimbabwe,flat,office
- **Description:**

  Find your next home, stand or office in Zimbabwe – from verified providers only.

  • Search houses, apartments, rooms, land/stands and commercial property for sale or rent
  • Map search with suburbs like Borrowdale, Avondale, Mount Pleasant and more
  • Filters for price, size, bedrooms, features and distance
  • Every provider is verified before listing – report anything suspicious with one tap
  • Message providers in the app – your number stays private
  • Save favourites and get alerts for new matches
  • Share listings with family via WhatsApp, SMS or email

  StandFinder is free to use. Premium members get members-only listings, early access to
  new properties and advanced filters.

### Texts – Deutsch

- **Untertitel:** Geprüfte Häuser, Grundstücke, Mieten
- **Kurzbeschreibung:** Geprüfte Häuser, Grundstücke und Büros in Simbabwe kaufen oder mieten. Chat in der App.
- **Beschreibung:**

  Finden Sie Ihr nächstes Zuhause, Grundstück oder Büro in Simbabwe – nur von geprüften Anbietern.

  • Häuser, Wohnungen, Zimmer, Grundstücke und Gewerbe zum Kauf oder zur Miete
  • Kartensuche mit Stadtteilen wie Borrowdale, Avondale, Mount Pleasant
  • Filter für Preis, Fläche, Zimmer, Ausstattung und Entfernung
  • Jeder Anbieter wird vor dem Inserieren geprüft – Verdächtiges mit einem Tipp melden
  • Anbieter direkt in der App anschreiben – Ihre Nummer bleibt privat
  • Favoriten speichern und bei neuen Treffern benachrichtigt werden
  • Inserate per WhatsApp, SMS oder E-Mail teilen

### Category, rating, URLs

- Category: **Lifestyle** (iOS) / **House & Home** (Play)
- Age rating: 4+ / Everyone (user-generated content: listings and messages are moderated, report button, block via admin suspension)
- Support URL `APP_URL/support` · Privacy policy `APP_URL/privacy` · Marketing URL `APP_URL`
- Screenshots: iPhone 6.9" (1320 × 2868) – at least 3; Play phone screenshots (1080 × 1920+) and a
  1024 × 500 feature graphic. Take them in the TestFlight / internal build with real listings
  (home, search map, listing, chat, saved). The app is iPhone-only, so no iPad screenshots are needed.

### App privacy (Apple) / Data safety (Google)

| Data | Collected | Linked to user | Purpose | Shared |
| --- | --- | --- | --- | --- |
| Email address, name | yes | yes | App functionality (account) | no |
| Phone number | only providers / mobile-money payers | yes | App functionality, purchases | Paynow (payment) |
| User content: messages, photos, listings | yes | yes | App functionality | no |
| Precise / approximate location | only on “Near me”, not stored | no | App functionality | no |
| Identifiers (user ID) | yes | yes | App functionality | no |
| Purchase history (Premium) | yes | yes | App functionality | no |
| Diagnostics, advertising, tracking | **no** | – | – | – |

- No tracking → no App Tracking Transparency prompt.
- Data is encrypted in transit; users can delete their account in the app (Profile → Delete account)
  and download their data (Profile → Download my data). Play asks for a deletion URL: `APP_URL/support`.
- Encryption export: `ITSAppUsesNonExemptEncryption = false` (only standard HTTPS) is already set.

### Review notes (App Store Connect → App Review Information)

Create two accounts in production first and paste them:

```
Customer: review@<your domain> / <password>
Verified provider: review-provider@<your domain> / <password>  (verify it in /admin)

StandFinder is a marketplace for verified property providers in Zimbabwe.
- Browse and search without an account; sign in to save properties and message providers.
- Native features: share sheet, "Near me" location search, universal links,
  camera/photo library for listing photos (provider account → Add property).
- Premium is not sold in the app and the app does not link to any purchase;
  the membership page says so. Members who already have Premium keep their benefits.
- Account deletion: Profile → Delete account.
```

## Store checklist

- [ ] Distinct store name and domain decided; `APP_URL` on a custom domain
- [ ] Website live with real, approved listings; `/support`, `/privacy`, `/terms`, `/imprint` filled with operator details
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, email and (optionally) Paynow configured
- [ ] Supabase Auth site URL / redirects set to `APP_URL`
- [ ] Apple: app record, bundle ID with Associated Domains, API key secrets, `SF_APP_URL` variable
- [ ] Google: Play app, upload key workflow run, closed test (12 testers × 14 days for new accounts)
- [ ] Release workflow run, TestFlight / internal test checked on real devices
- [ ] `APPLE_TEAM_ID`, `ANDROID_CERT_SHA256` set → universal / app links verified
- [ ] Screenshots, texts, privacy labels, data safety form, content rating questionnaire
- [ ] Review accounts created and entered
