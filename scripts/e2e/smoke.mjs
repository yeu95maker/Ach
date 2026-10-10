#!/usr/bin/env node
/**
 * Browser smoke test + screenshots against the local test gateway.
 *   node scripts/e2e/smoke.mjs [outDir]
 * Requires: gateway (scripts/e2e/gateway.mjs) and `npm run dev` running.
 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://localhost:5173'
const OUT = process.argv[2] ?? 'screenshots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const problems = []

async function session(name, { email, viewport, theme, locale = 'de' }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: theme, locale })
  await context.addInitScript(([t, l]) => {
    localStorage.setItem('shiftcare.theme', t)
    localStorage.setItem('shiftcare.locale', l)
  }, [theme, locale])
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' && !/realtime|websocket|WebSocket|signedURL|storage/i.test(m.text())) problems.push(`[${name}] console: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`))

  await page.goto(`${BASE}/login`)
  await page.screenshot({ path: `${OUT}/${name}-01-login.png` })
  await page.fill('#email', email)
  await page.fill('#password', 'ShiftCare!2026')
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`)
  await page.waitForSelector('h1')
  await page.waitForTimeout(900)
  return { context, page }
}

const shot = async (page, name, file, opts = {}) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}-${file}.png`, fullPage: opts.full ?? true })
}

const runs = [
  { name: 'mobile-light', email: 'anna.becker@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' },
  { name: 'mobile-dark', email: 'anna.becker@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'dark' },
  { name: 'desktop-light', email: 'mira.schulz@shiftcare.dev', viewport: { width: 1440, height: 900 }, theme: 'light' },
  { name: 'desktop-dark', email: 'mira.schulz@shiftcare.dev', viewport: { width: 1440, height: 900 }, theme: 'dark' },
  { name: 'tablet-light', email: 'anna.becker@shiftcare.dev', viewport: { width: 834, height: 1112 }, theme: 'light', locale: 'en' },
]

for (const run of runs) {
  const { context, page } = await session(run.name, run)
  await shot(page, run.name, '02-dashboard')

  await page.goto(`${BASE}/schedule`)
  await page.waitForSelector('[aria-label*=":"]')
  await shot(page, run.name, '03-schedule-month')
  // open today's cell → detail sheet
  await page.locator('button[aria-label*=":"]').filter({ has: page.locator('.bg-primary') }).first().click()
  await page.waitForSelector('dialog[open]')
  await shot(page, run.name, '04-schedule-detail', { full: false })
  await page.keyboard.press('Escape')
  await page.goto(`${BASE}/schedule?view=week`)
  await shot(page, run.name, '05-schedule-week')

  await page.goto(`${BASE}/team`)
  await shot(page, run.name, '06-team-on-duty')
  await page.goto(`${BASE}/team?tab=colleagues`)
  await shot(page, run.name, '07-team-colleagues')
  if (run.email.startsWith('mira')) {
    await page.goto(`${BASE}/team?tab=requests`)
    await shot(page, run.name, '08-team-requests')
    await page.goto(`${BASE}/team?tab=sick`)
    await shot(page, run.name, '09-team-sick')
  }
  await page.goto(`${BASE}/notifications`)
  await shot(page, run.name, '10-notifications')
  await page.goto(`${BASE}/profile`)
  await shot(page, run.name, '11-profile')
  await page.goto(`${BASE}/requests/sick/new`)
  await shot(page, run.name, '12-sick')
  await page.goto(`${BASE}/requests/leave/new`)
  await shot(page, run.name, '13-leave')
  await page.goto(`${BASE}/requests`)
  await shot(page, run.name, '14-requests')
  await context.close()
}

// Functional flow: nurse requests leave → manager approves → nurse sees status
{
  const nurse = await session('flow-nurse', { email: 'jonas.weber@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  await nurse.page.goto(`${BASE}/requests/leave/new`)
  await nurse.page.fill('#start', '2027-03-01')
  await nurse.page.fill('#end', '2027-03-05')
  await nurse.page.click('button[type=submit]')
  await nurse.page.waitForURL(`${BASE}/requests`)
  await nurse.page.waitForSelector('text=Offen')

  await nurse.page.goto(`${BASE}/requests/sick/new`)
  await nurse.page.click('button[type=submit]')
  await nurse.page.waitForSelector('text=Krankmeldung gesendet')
  await shot(nurse.page, 'flow', '20-sick-success', { full: false })

  const lead = await session('flow-lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  await lead.page.goto(`${BASE}/team?tab=requests`)
  await lead.page.waitForSelector('text=März 2027')
  const card = lead.page.locator('div.rounded-\\[var\\(--radius-card\\)\\]', { hasText: 'März 2027' }).first()
  await card.getByRole('button', { name: 'Genehmigen' }).click()
  await lead.page.waitForSelector('dialog[open]')
  await lead.page.fill('#decision-note', 'Gute Erholung')
  await lead.page.locator('dialog[open]').getByRole('button', { name: 'Genehmigen' }).click()
  await lead.page.waitForSelector('text=Antrag genehmigt')
  await lead.page.goto(`${BASE}/team?tab=sick`)
  await lead.page.getByRole('button', { name: 'Kommentar anzeigen' }).first().click()
  await shot(lead.page, 'flow', '21-lead-sick-comment')

  await nurse.page.goto(`${BASE}/requests`)
  await nurse.page.waitForSelector('text=Genehmigt')
  await nurse.page.goto(`${BASE}/notifications`)
  await nurse.page.waitForSelector('text=Urlaub genehmigt')
  await shot(nurse.page, 'flow', '22-nurse-notifications')
  await nurse.context.close()
  await lead.context.close()
}

// Wunschplan: nurse paints + submits wishes → scheduler sees them in the matrix and reviews one
{
  const nurse = await session('wish-nurse', { email: 'leyla.yilmaz@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  await nurse.page.goto(`${BASE}/schedule/wishes`)
  const cells = nurse.page.locator('[role=gridcell]')
  await cells.nth(4).click()
  await cells.nth(5).click()
  await nurse.page.getByRole('radio', { name: 'Nacht' }).click()
  await cells.nth(11).click()
  await shot(nurse.page, 'wish', '30-nurse-editing', { full: false })
  await nurse.page.getByRole('button', { name: /Wunschplan einreichen/ }).click()
  await nurse.page.waitForSelector('text=Dein Wunschplan wurde erfolgreich eingereicht.')
  await shot(nurse.page, 'wish', '31-nurse-success', { full: false })

  const lead = await session('wish-lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1440, height: 900 }, theme: 'light' })
  await lead.page.goto(`${BASE}/schedule/wishes/manage`)
  await lead.page.waitForSelector('text=Leyla')
  await shot(lead.page, 'wish', '32-lead-matrix')
  await lead.page.locator('table button').first().click()
  await lead.page.locator('dialog[open]').getByRole('button', { name: 'Berücksichtigt', exact: true }).click()
  await lead.page.waitForSelector('text=1 Wunsch bewertet')
  await lead.page.goto(`${BASE}/schedule/wishes/manage?view=list`)
  await shot(lead.page, 'wish', '33-lead-list')
  await nurse.context.close()
  await lead.context.close()
}

// Dienstplan-Editor: plan shifts next to wishes, see warnings, publish
{
  const lead = await session('editor', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1440, height: 900 }, theme: 'light' })
  await lead.page.goto(`${BASE}/schedule/plan`)
  await lead.page.waitForSelector('text=Offene Dienste')
  const cell = (name, day) => lead.page.locator('tr', { hasText: name }).locator('td').nth(day - 1).locator('button')
  await lead.page.getByRole('radio').filter({ hasText: 'Frühdienst' }).click()
  await cell('Jonas', 5).click()
  await lead.page.waitForSelector('text=8:15 h')
  await lead.page.getByRole('radio').filter({ hasText: 'Spätdienst' }).click()
  await lead.page.locator('tr', { hasText: 'Offene Dienste' }).locator('td').nth(9).getByRole('button').last().click()
  await lead.page.getByRole('radio').filter({ hasText: 'Ansehen' }).click()
  await cell('Anna', 5).click()
  await lead.page.waitForSelector('text=Der Dienst widerspricht dem eingereichten Wunsch.')
  await shot(lead.page, 'editor', '40-cell-details', { full: false })
  await lead.page.keyboard.press('Escape')
  await shot(lead.page, 'editor', '41-grid')
  await lead.page.getByRole('button', { name: 'Veröffentlichen' }).click()
  await lead.page.locator('dialog[open]').getByRole('button', { name: 'Jetzt veröffentlichen' }).click()
  await lead.page.waitForSelector('text=Veröffentlicht · v1')
  await lead.context.close()
}

await browser.close()
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`✓ smoke test passed, screenshots in ${OUT}`)
