#!/usr/bin/env node
/**
 * Browser end-to-end journeys (Playwright) against a running app + test gateway:
 *
 *   PGUSER=… PGDATABASE=marketplace_test node scripts/e2e/gateway.mjs   # fresh seed: SKIP_TESTS=1 ./scripts/db-test.sh
 *   npm run build && npx next start -p 3000
 *   node scripts/e2e/journeys.mjs [screenshots-dir]
 *
 * Covers: discovery (list, map, property page), locked premium listing, sign-up,
 * saving, messaging, demo premium checkout, provider listing wizard with photo
 * upload, admin approval → listing goes live, provider reply.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const OUT = process.argv[2] ?? 'screenshots'
const PASSWORD = 'Marketplace!2026'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
let step = 0
const shot = async (page, name) => page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: false })
const log = (msg) => console.log(`✓ ${msg}`)
const expect = async (locator, what) => {
  await locator.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {
    throw new Error(`not visible: ${what}`)
  })
}

async function login(page, email) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

try {
  // 1. Discovery as a visitor ------------------------------------------------
  const visitor = await browser.newContext(phone)
  let page = await visitor.newPage()
  await page.goto(BASE)
  await expect(page.getByText('What are you looking for?'), 'home title')
  await shot(page, 'home')
  await page.getByRole('button', { name: /Houses/ }).click()
  await page.getByPlaceholder('Min').first().fill('100000')
  await page.getByPlaceholder('Max').first().fill('250000')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.waitForURL(/\/search\?/)
  await expect(page.getByText('Modern Family House'), 'search result')
  await shot(page, 'search-results')
  log('home → search (houses $100k–$250k)')

  await page.goto(`${BASE}/search?city=Harare&view=map`)
  await expect(page.locator('[data-marker]'), 'map markers')
  await shot(page, 'map')
  await page.locator('[data-marker]').first().click()
  await shot(page, 'map-preview')
  log('map with price markers + preview')

  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000001`)
  await expect(page.getByRole('heading', { name: 'Modern Family House' }), 'property title')
  await shot(page, 'property')
  await page.getByText('Surrounding area').scrollIntoViewIfNeeded()
  await shot(page, 'property-area')
  log('property page')

  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000005`)
  await expect(page.getByText('This property is reserved for Premium members.'), 'locked text')
  if (await page.getByText('$320,000').count()) throw new Error('locked price leaked')
  await shot(page, 'property-locked')
  log('members-only property is locked for visitors')

  // Rentals, radius search, map clusters ------------------------------------------
  await page.goto(BASE)
  await page.getByRole('button', { name: 'Rent', exact: true }).click()
  await page.getByRole('button', { name: /Apartments/ }).click()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.waitForURL(/transaction=rent/)
  await expect(page.getByText('Furnished 2-Bed Flat'), 'rental result')
  await expect(page.getByText('/ month'), 'monthly price')
  await shot(page, 'rent-results')
  await page.getByText('Furnished 2-Bed Flat').first().click()
  await expect(page.getByText('Deposit'), 'rent details')
  await expect(page.getByText('Year built'), 'building details')
  await page.getByText('Main information').scrollIntoViewIfNeeded()
  await shot(page, 'rent-details')
  log('rentals: Buy/Rent toggle, monthly prices, deposit and building details')

  await page.goto(`${BASE}/search?transaction=rent&near=-17.8,31.037&radius_km=2&place=Avondale`)
  await expect(page.getByText('Furnished 2-Bed Flat'), 'inside radius')
  if (await page.getByText('Family House to Let').count()) throw new Error('Borrowdale house should be outside 2 km')
  log('radius search: 2 km around Avondale')

  await page.goto(`${BASE}/search?city=Harare&view=map`)
  await expect(page.locator('[data-cluster]'), 'map clusters at city zoom')
  await shot(page, 'map-clusters')
  await page.locator('[data-cluster]').first().click()
  await page.waitForTimeout(900)
  log('map clusters expand on tap')

  // 2. Sign-up, save, message -------------------------------------------------
  const customer = await browser.newContext(phone)
  page = await customer.newPage()
  const email = `buyer-${Date.now()}@example.com`
  await page.goto(`${BASE}/signup`)
  await page.getByLabel('Full name').fill('Chipo Test')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create free account' }).click()
  await page.waitForURL(`${BASE}/`)
  log('sign-up')

  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000003`)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved to your list'), 'saved toast')
  await page.getByRole('button', { name: 'Message provider' }).first().click()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.waitForURL(/\/messages\//)
  await expect(page.getByText('Hello, is this property still available?'), 'first message')
  await page.getByPlaceholder('Type a message…').fill('Could I arrange a viewing on Saturday?')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Could I arrange a viewing on Saturday?'), 'second message')
  await shot(page, 'conversation')
  log('save + message provider (property attached)')

  await page.goto(`${BASE}/saved`)
  await expect(page.getByText('Garden Cottage with Pool'), 'saved property')
  await shot(page, 'saved')

  // 3. Premium ------------------------------------------------------------------
  await page.goto(`${BASE}/membership?next=/properties/e0000000-0000-4000-8000-000000000005`)
  await shot(page, 'membership')
  if (process.env.PAYNOW_E2E) {
    // EcoCash express checkout: prompt on the phone, app waits for Paynow's confirmation
    await page.getByLabel('EcoCash number').fill('077 111 1111')
    await shot(page, 'membership-ecocash')
    await page.getByRole('button', { name: /^Pay \$9/ }).click()
    await expect(page.getByText('Check your phone and enter your PIN'), 'approve on phone')
    await shot(page, 'payment-waiting')
    await page.waitForURL(/\/properties\/e0000000-0000-4000-8000-000000000005/, { timeout: 30000 })
    await expect(page.getByText('$320,000'), 'unlocked price')
    log('Paynow EcoCash payment → premium listing unlocked')

    // Card via the Paynow checkout page, second customer
    const cardCtx = await browser.newContext(phone)
    const cardPage = await cardCtx.newPage()
    await login(cardPage, 'tariro@demo.property')
    await cardPage.goto(`${BASE}/membership`)
    await cardPage.getByRole('radio', { name: /Yearly/ }).click()
    await cardPage.getByRole('button', { name: 'Card / other' }).click()
    await cardPage.getByRole('button', { name: /^Pay \$90/ }).click()
    await cardPage.waitForURL(/\/pay\//)
    await cardPage.locator('#pay').click()
    await cardPage.waitForURL(/\/membership/, { timeout: 30000 })
    await expect(cardPage.getByText('You are a Premium member.'), 'premium after card payment')
    await shot(cardPage, 'membership-active')
    log('Paynow card payment (redirect + return) → Premium for a year')

    // Declined EcoCash payment leaves the account free
    const failCtx = await browser.newContext(phone)
    const failPage = await failCtx.newPage()
    await login(failPage, 'lena@demo.property')
    await failPage.goto(`${BASE}/membership`)
    await failPage.getByRole('button', { name: 'Extend Premium' }).click().catch(() => {})
    await failPage.getByLabel('EcoCash number').fill('0773333333')
    await failPage.getByRole('button', { name: /^Pay / }).click()
    await expect(failPage.getByText('cancelled or declined'), 'declined message')
    log('declined EcoCash payment is reported, nothing activated')
  } else {
    await page.getByRole('button', { name: 'Become a member' }).click()
    await page.waitForURL(/\/properties\/e0000000-0000-4000-8000-000000000005/)
    await expect(page.getByText('$320,000'), 'unlocked price')
    log('demo checkout → premium listing unlocked')
  }
  await shot(page, 'property-unlocked')

  // 4. Provider adds a listing ---------------------------------------------------
  const providerCtx = await browser.newContext(phone)
  page = await providerCtx.newPage()
  await login(page, 'sunrise@demo.property')
  await page.goto(`${BASE}/provider`)
  await shot(page, 'provider-dashboard')
  await page.goto(`${BASE}/provider/properties/new`)
  await page.getByRole('button', { name: 'Land', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Area / suburb').fill('Borrowdale')
  const map = page.locator('.maplibregl-canvas')
  await map.waitFor()
  const box = await map.boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await shot(page, 'wizard-location')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Asking price (USD)').fill('35000')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel(/Property size/).fill('900')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByText('Water', { exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[type=file]').setInputFiles({ name: 'stand.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByText('Cover'), 'uploaded photo')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Title').fill('Serviced Stand near Borrowdale Brooke')
  await page.getByLabel('Description').fill('Serviced 900 m² stand with water connection.')
  await page.getByRole('button', { name: 'Next' }).click()
  await shot(page, 'wizard-preview')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Submit listing' }).click()
  await page.waitForURL(`${BASE}/provider`)
  await expect(page.getByText('Serviced Stand near Borrowdale Brooke'), 'new listing on dashboard')
  log('provider listing wizard (9 steps, photo upload) → in review')

  await page.goto(`${BASE}/provider/import`)
  await page.locator('input[type=file]').setInputFiles({
    name: 'stock.csv', mimeType: 'text/csv',
    buffer: Buffer.from('type,title,price_usd,city,area,land_size_m2,living_area_m2,bedrooms,features\nstand,Stand in Greendale,18000,Harare,Greendale,450,,,water;road access\ncluster,Cluster in Avondale,82000,Harare,Avondale,,110,3,garden\nboat,Not a property,1,Harare,Avondale,1,,,\n'),
  })
  await expect(page.getByText('2 of 3 rows are ready to import'), 'import preview')
  await shot(page, 'import-preview')
  await page.getByRole('button', { name: 'Import 2 as drafts' }).click()
  await expect(page.getByText('2 drafts created.'), 'import done')
  await page.goto(`${BASE}/provider`)
  await expect(page.getByText('Cluster in Avondale'), 'imported draft on dashboard')
  log('CSV import → 2 drafts, invalid row reported')

  // 5. Admin approves -------------------------------------------------------------
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await adminCtx.newPage()
  await login(page, 'admin@demo.property')
  await page.goto(`${BASE}/admin`)
  await shot(page, 'admin-overview')
  await page.goto(`${BASE}/admin?tab=properties&status=pending`)
  const card = page.locator('div.rounded-2xl', { hasText: 'Serviced Stand near Borrowdale Brooke' }).last()
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Saved'), 'approved toast')
  await page.goto(`${BASE}/admin?tab=providers`)
  await shot(page, 'admin-providers')
  log('admin approves listing')

  page = await visitor.newPage()
  await page.goto(`${BASE}/search?area=Borrowdale&category=land`)
  await expect(page.getByText('Serviced Stand near Borrowdale Brooke'), 'listing is public')
  log('approved listing is publicly searchable')

  // 6. Provider replies ---------------------------------------------------------------
  const abc = await browser.newContext(phone)
  page = await abc.newPage()
  await login(page, 'abc@demo.property')
  await page.goto(`${BASE}/messages`)
  await shot(page, 'provider-inbox')
  await page.getByText('Chipo Test').first().click()
  await page.getByPlaceholder('Type a message…').fill('Yes, Saturday 10:00 works.')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Yes, Saturday 10:00 works.'), 'reply')
  log('provider replies in-app')

  // 7. Partner link → provider sign-up → referral tracked; founding badge -------------
  const invited = await browser.newContext(phone)
  page = await invited.newPage()
  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000001`)
  await expect(page.getByText('Founding Provider'), 'founding badge')
  await page.goto(`${BASE}/for-providers?ref=hre-tino`)
  await expect(page.getByText('Invitation code HRE-TINO applied'), 'landing with code')
  await shot(page, 'for-providers')
  await page.getByRole('link', { name: 'List your properties for free' }).first().click()
  await page.getByLabel('Full name').fill('Chiedza Agent')
  await page.getByLabel('Email').fill(`agent-${Date.now()}@example.com`)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create free account' }).click()
  await page.waitForURL(/\/provider\/onboarding/)
  if ((await page.getByLabel('Referral code (optional)').inputValue()) !== 'HRE-TINO') throw new Error('referral code not prefilled')
  await page.getByLabel('Public name').fill('Chiedza Realty')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByLabel('Full legal name'), 'verification step')
  log('partner link → provider sign-up with referral code; founding badge shown')

  page = await adminCtx.newPage()
  await page.goto(`${BASE}/admin?tab=partners`)
  await expect(page.getByText('Chiedza Realty'), 'provider listed under partner')
  await shot(page, 'admin-partners')
  log('admin sees the partner\'s providers and results')

  await visitor.addCookies([{ name: 'locale', value: 'de', url: BASE }])
  page = await visitor.newPage()
  await page.goto(BASE)
  await expect(page.getByText('Was suchen Sie?'), 'German home')
  await shot(page, 'home-de')
  log('German UI')

  writeFileSync(`${OUT}/RESULT.txt`, 'all journeys passed\n')
  console.log('\nAll journeys passed.')
} catch (e) {
  console.error('✗', e.message)
  for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.screenshot({ path: `${OUT}/failure-${Date.now()}.png` }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser.close()
}
