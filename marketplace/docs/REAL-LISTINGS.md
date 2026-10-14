# Getting real Zimbabwean properties into Property Finder

The app only shows properties from **verified providers**, and every listing is
reviewed before it goes live. Real inventory therefore has to come from real
sellers, agents and developers who agree to list. There is no shortcut that is
both legal and trustworthy:

- **Do not copy listings** from other portals (property.co.zw, classifieds.co.zw,
  Facebook groups …). Their content, photos and contact details are owned by
  those sites or the sellers, it is usually against their terms, the listings go
  stale quickly, and you could not verify the providers – the core promise of
  the app.
- No public, licensed feed of Zimbabwean property listings exists that could be
  plugged in.

What works is supply-first onboarding, which the app is built for.

## 1. Recruit the first 20–30 providers (target: 100+ live listings before launch)

| Who | Why they say yes | Where to find them |
| --- | --- | --- |
| Land developers / stand sellers (Harare South, Ruwa, Hatfield, Borrowdale, Mount Hampden …) | Large inventories of serviced stands, need buyers incl. diaspora | Site boards, Facebook / WhatsApp adverts, Herald classifieds |
| Registered estate agents | Free extra channel, verified badge differentiates them from fake agents | Estate Agents Council of Zimbabwe register, agency offices in Avondale, Borrowdale, CBD |
| Property developers (cluster homes, flats) | New projects need visibility | Show houses, developer websites |
| Private owners | Free, safe in-app contact (no exposed phone number) | Referrals from agents, your own network |

Offer for founding providers: listing is free anyway; add e.g. *"Founding
Provider"* status, free featured placement at launch, and **free Premium for
their team** (Admin → Users → *Grant Premium*).

## 2. Onboard them in one visit

1. Provider creates an account → *List your property* → profile → verification
   (ID, phone, company registration, EAC number for agents, documents).
2. Admin verifies them the same day (Admin → Providers).
3. **Bulk import:** the provider (or you, sitting with them) exports their stock
   to a spreadsheet → *My properties → Import spreadsheet* (CSV template
   provided; up to 200 rows; words like *stand, plot, cluster, office* are understood).
   Each row becomes a draft.
4. For each draft: add photos (taken on site or from the provider – they must own
   them), set the exact map pin, submit. Admin approves.

A provider with 30 stands is live in about an hour.

## 3. Keep listings real

- Providers confirm availability every 30 days (dashboard prompt; cron
  `request_availability_confirmations`), stale listings can be removed.
- Buyers report problems on every listing; admins act from the Reports tab.
- Ask developers for the subdivision permit / title reference during
  verification and spot-check a few stands in person before launch.

## 4. Then bring buyers

Launch only after ~100 live listings in Harare, then market to buyers
(including the diaspora, who can pay Premium by card via Paynow).
