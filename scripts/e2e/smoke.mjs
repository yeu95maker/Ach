#!/usr/bin/env node
/**
 * Browser smoke test + screenshots against the local test gateway.
 *   node scripts/e2e/smoke.mjs [outDir]
 * Requires: gateway (scripts/e2e/gateway.mjs) and `npm run dev` running.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
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
    // CSP violations always count (production builds ship a Content-Security-Policy).
    if (/Content Security Policy/i.test(m.text()) || (m.type() === 'error' && !/realtime|websocket|WebSocket|signedURL|storage/i.test(m.text())))
      problems.push(`[${name}] console: ${m.text()}`)
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

// Team lead: Aktuelles, sick-leave cover, open shifts; staff: history; admin
{
  const lead = await session('lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  const p = lead.page
  await p.goto(`${BASE}/news`)
  await p.getByRole('button', { name: 'Neu' }).click()
  await p.locator('label', { hasText: 'Fortbildung' }).first().click()
  await p.fill('#news-title', 'Fortbildung Wundversorgung')
  await p.fill('#news-body', 'Bitte bis Freitag anmelden.')
  await p.fill('#news-date', '2027-01-14')
  await p.fill('#news-from', '09:00')
  await p.fill('#news-to', '12:00')
  await p.getByRole('button', { name: 'Senden' }).click()
  await p.waitForSelector('text=Dein Team wurde benachrichtigt.')
  await shot(p, 'lead', '50-news')

  await p.goto(`${BASE}/team?tab=sick`)
  await p.getByRole('button', { name: 'Vertretung finden' }).first().click()
  await p.waitForSelector('dialog[open] >> text=Wer kann übernehmen?')
  // Wait for the candidate list: the centred dialog grows when it arrives and would move the button mid-click.
  await p.waitForSelector('dialog[open] >> text=Hinweise zu Ruhezeit')
  await p.locator('dialog[open]').getByRole('button', { name: 'Als offenen Dienst ausschreiben' }).click()
  await p.waitForSelector('text=Offener Dienst ausgeschrieben')
  await lead.context.close()

  const nurse = await session('nurse-lead-flows', { email: 'anna.becker@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  await nurse.page.goto(`${BASE}/schedule/open`)
  // the seeded open late shift (on the nurse's day off) is the first "Spätdienst" card
  const openCard = (page) => page.locator('div.rounded-\\[var\\(--radius-card\\)\\]', { hasText: 'Spätdienst' }).first()
  await openCard(nurse.page).getByRole('button', { name: 'Ich kann einspringen' }).click()
  await nurse.page.waitForSelector('text=Du hast Interesse gemeldet')
  await nurse.page.goto(`${BASE}/schedule/history`)
  await nurse.page.waitForSelector('text=Verlauf seit')
  await shot(nurse.page, 'nurse-lead-flows', '51-history')
  await nurse.page.goto(`${BASE}/news`)
  await nurse.page.waitForSelector('text=Fortbildung Wundversorgung')
  await nurse.context.close()

  const lead2 = await session('lead-staffing', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'dark' })
  await lead2.page.goto(`${BASE}/schedule/open`)
  await openCard(lead2.page).getByRole('button', { name: 'Besetzen' }).click()
  await lead2.page.waitForSelector('dialog[open] >> text=Hat Interesse gemeldet')
  await shot(lead2.page, 'lead-staffing', '52-candidates', { full: false })
  await lead2.page.keyboard.press('Escape')
  await lead2.page.locator('dialog[open]').waitFor({ state: 'detached' })
  // Einspringen 2.0: one tap confirms the volunteer
  await openCard(lead2.page).locator('li', { hasText: 'Anna Becker' }).getByRole('button', { name: 'Bestätigen' }).click()
  await lead2.page.waitForSelector('text=Anna Becker übernimmt den Dienst')
  // Stationsstatus on the dashboard
  await lead2.page.goto(`${BASE}/`)
  await lead2.page.waitForSelector('text=Stationsstatus heute')
  await lead2.page.waitForSelector('dl >> text=Krank')
  await shot(lead2.page, 'lead-staffing', '54-ward-status')
  await lead2.context.close()

  const admin = await session('admin', { email: 'admin@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  await admin.page.goto(`${BASE}/admin`)
  await admin.page.getByRole('button', { name: 'Einladen' }).click()
  await admin.page.fill('#inv-first', 'Nora')
  await admin.page.fill('#inv-last', 'Neumann')
  await admin.page.fill('#inv-email', 'nora.neumann@shiftcare.dev')
  await admin.page.getByRole('button', { name: 'Einladung senden' }).click()
  await admin.page.waitForSelector('text=Nora Neumann')
  await shot(admin.page, 'admin', '53-admin')
  await admin.context.close()
}

// Integration Hub: import a CSV export for next month, map, publish; the nurse sees the shift
{
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const day = (n) => `${String(n).padStart(2, '0')}.${mm}.${next.getFullYear()}`
  const csvPath = `${OUT}/dienstplan-import.csv`
  writeFileSync(
    csvPath,
    '\uFEFF' +
      ['Personalnummer;Name;Datum;Dienst;Beginn;Ende', `P-1001;Becker, Anna;${day(2)};F;06:00;14:15`, `P-1001;Becker, Anna;${day(3)};FD;;`,
       `P-1002;Weber, Jonas;${day(2)};N;21:45;06:15`, `EXT-9;Yılmaz, Leyla;${day(4)};S;;`].join('\r\n'),
  )
  const lead = await session('import', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  const p = lead.page
  await p.goto(`${BASE}/schedule/import`)
  await p.setInputFiles('[data-testid=import-file]', csvPath)
  await p.waitForSelector('text=4 Dienste gelesen')
  await shot(p, 'import', '60-columns')
  await p.getByRole('button', { name: 'Prüfen' }).click()
  await p.waitForSelector('text=1 Person zuordnen')
  await p.locator('select[aria-label^="Person für"]').selectOption({ label: 'Yılmaz, Leyla · Pflegefachfrau' })
  await p.locator('li', { hasText: 'EXT-9' }).getByRole('button', { name: 'Bestätigen' }).click()
  await p.waitForSelector('text=1 Person zuordnen', { state: 'detached' })
  await p.locator('select[aria-label="Kürzel FD zuordnen"]').selectOption({ label: 'F · Frühdienst' })
  await p.locator('li', { hasText: 'FD' }).getByRole('button', { name: 'Bestätigen' }).click()
  await p.getByRole('button', { name: 'Weiter zur Vorschau' }).click()
  await p.waitForSelector('text=Vorschau der Änderungen')
  await shot(p, 'import', '61-preview', { full: false })
  await p.getByRole('button', { name: /Änderungen? übernehmen/ }).click()
  await p.waitForSelector('text=Dienstplan übernommen')
  if (await p.getByRole('button', { name: 'Veröffentlichen' }).count()) {
    await p.getByRole('button', { name: 'Veröffentlichen' }).click()
    await p.waitForSelector('text=Dienstplan veröffentlicht')
  }
  await p.goto(`${BASE}/schedule/import?tab=history`)
  await p.waitForSelector('text=dienstplan-import.csv')
  await shot(p, 'import', '62-history')
  await lead.context.close()

  const nurse = await session('import-nurse', { email: 'anna.becker@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  await nurse.page.goto(`${BASE}/schedule?view=day&date=${next.getFullYear()}-${mm}-02`)
  await nurse.page.waitForSelector('text=Frühdienst')
  await nurse.page.waitForSelector('text=/Stand:/')
  await shot(nurse.page, 'import-nurse', '63-imported-day')
  await nurse.context.close()

  const admin = await session('integrations', { email: 'admin@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  await admin.page.goto(`${BASE}/admin?tab=integrations`)
  await admin.page.waitForSelector('text=EXT-9')
  await shot(admin.page, 'integrations', '64-profiles')
  await admin.context.close()
}

// Automatische Synchronisierung: admin creates an interface profile + key, the planning
// system delivers, the ward lead is notified and confirms the changes
{
  const admin = await session('sync-admin', { email: 'admin@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  const a = admin.page
  await a.goto(`${BASE}/admin?tab=integrations`)
  await a.getByRole('button', { name: 'Importprofil anlegen' }).click()
  await a.fill('#int-name', 'Schnittstelle Dienstplanprogramm')
  await a.selectOption('#int-kind', 'api')
  await a.locator('dialog[open]').getByRole('button', { name: 'Speichern' }).click()
  await a.waitForSelector('text=Adresse der Schnittstelle')
  // the DB suite may leave other interface profiles behind – use the one just created
  // (innermost matching card = last in document order)
  await a.locator('div.rounded-\\[var\\(--radius-card\\)\\]', { hasText: 'Schnittstelle Dienstplanprogramm' }).last()
    .getByRole('button', { name: 'Neuer Schlüssel' }).click()
  await a.fill('#api-key-label', 'Smoke-Test')
  await a.locator('dialog[open]').getByRole('button', { name: 'Schlüssel erzeugen' }).click()
  await a.waitForSelector('#api-key-value')
  const key = await a.inputValue('#api-key-value')
  await shot(a, 'sync', '80-admin-key', { full: false })
  await admin.context.close()

  const m = new Date(); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 3)
  const iso = (d) => d.toISOString().slice(0, 10)
  const day = (n) => iso(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), n)))
  const payload = {
    unit: '3A',
    period: { start: day(1), end: iso(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0))) },
    source_version: 'Smoke v1',
    shifts: [
      { employee: 'P-1001', date: day(3), code: 'F' },
      { employee: 'P-1001', date: day(4), code: 'S' },
      { employee: 'P-1003', date: day(3), code: 'N' },
    ],
  }
  const deliver = (body) =>
    fetch('http://localhost:54321/functions/v1/roster-sync', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const r1 = await deliver(payload)
  const j1 = await r1.json()
  if (r1.status !== 202 || j1.status !== 'staged') problems.push(`[sync] first delivery: ${r1.status} ${JSON.stringify(j1)}`)
  const j2 = await (await deliver(payload)).json()
  if (j2.status !== 'unchanged') problems.push(`[sync] repeated delivery: ${JSON.stringify(j2)}`)
  const bad = await fetch('http://localhost:54321/functions/v1/roster-sync', { method: 'POST', headers: { authorization: 'Bearer pls_wrong' }, body: JSON.stringify(payload) })
  if (bad.status !== 401) problems.push(`[sync] wrong key: ${bad.status}`)

  const lead = await session('sync-lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  const p = lead.page
  await p.goto(`${BASE}/notifications`)
  await p.getByText('Neuer Dienstplanstand aus Schnittstelle Dienstplanprogramm').first().click()
  await p.waitForURL(/\/schedule\/import\?run=/)
  await p.getByRole('button', { name: 'Weiter zur Vorschau' }).click()
  await p.waitForSelector('text=Vorschau der Änderungen')
  await shot(p, 'sync', '81-lead-preview', { full: false })
  await p.getByRole('button', { name: /Änderungen? übernehmen/ }).click()
  await p.waitForSelector('text=Dienstplan übernommen')
  await lead.context.close()
}

// Stationschat: nurse writes, the ward lead sees it live in her chat and hides a message
{
  const nurse = await session('chat-nurse', { email: 'leyla.yilmaz@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  await nurse.page.goto(`${BASE}/team`)
  await nurse.page.getByRole('link', { name: /Stationschat/ }).click()
  await nurse.page.waitForSelector('text=Bitte keine Patientendaten')
  await nurse.page.fill('#chat-input', 'Wer hat Lust, Freitag zusammen zur Fortbildung zu fahren?')
  await nurse.page.getByRole('button', { name: 'Senden' }).click()
  await nurse.page.waitForSelector('text=zusammen zur Fortbildung')
  await shot(nurse.page, 'chat', '70-nurse', { full: false })

  const lead = await session('chat-lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  await lead.page.goto(`${BASE}/team/chat`)
  await lead.page.waitForSelector('text=zusammen zur Fortbildung')
  await lead.page.getByRole('button', { name: /Nachricht von Leyla/ }).last().click()
  await lead.page.locator('dialog[open]').getByRole('button', { name: /Ausblenden/ }).click()
  await lead.page.waitForSelector('text=Nachricht ausgeblendet')
  await shot(lead.page, 'chat', '71-lead', { full: false })

  await nurse.page.reload()
  await nurse.page.waitForSelector('text=Von der Leitung ausgeblendet')
  if (await nurse.page.locator('text=zusammen zur Fortbildung').count()) problems.push('[chat] hidden text still visible')
  await nurse.context.close()
  await lead.context.close()
}

// Diensttausch: Anna offers a shift to Jonas, Jonas agrees, the ward lead approves
{
  const nurse = await session('swap-nurse', { email: 'anna.becker@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  const p = nurse.page
  let offered = false
  for (let d = 2; d <= 20 && !offered; d++) {
    const day = new Date(Date.now() + d * 86_400_000)
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    await p.goto(`${BASE}/schedule?date=${iso}&view=day`)
    await p.waitForSelector('main h2')
    const offer = p.getByRole('link', { name: 'Dienst tauschen' })
    if (!(await offer.count())) continue
    await offer.first().click()
    await p.waitForSelector('dialog[open] >> text=Wähle, mit wem du tauschen möchtest')
    await p.locator('dialog[open] [aria-busy]').waitFor({ state: 'detached' }).catch(() => {})
    await p.waitForTimeout(400)
    const jonas = p.locator('dialog[open] section', { hasText: 'Jonas Weber' })
    if (!(await jonas.count())) {
      await p.keyboard.press('Escape')
      continue
    }
    await jonas.getByRole('radio').first().click()
    await p.fill('#swap-note', 'Familienfeier')
    await shot(p, 'swap', '90-offer', { full: false })
    await p.locator('dialog[open]').getByRole('button', { name: 'Anfrage an Jonas senden' }).click()
    await p.waitForSelector('text=Anfrage gesendet')
    offered = true
  }
  if (!offered) problems.push('[swap] no shift of Anna could be offered to Jonas')
  await nurse.context.close()

  if (offered) {
    const colleague = await session('swap-colleague', { email: 'jonas.weber@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
    await colleague.page.goto(`${BASE}/schedule/swaps`)
    const card = colleague.page.locator('[data-testid=swap-card]', { hasText: 'Familienfeier' })
    await card.getByRole('button', { name: 'Zusagen' }).click()
    await colleague.page.waitForSelector('text=Jetzt entscheidet die Stationsleitung.')
    await colleague.context.close()

    const lead = await session('swap-lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
    await lead.page.goto(`${BASE}/schedule/swaps`)
    await lead.page.waitForSelector('text=Wartet auf dich')
    await shot(lead.page, 'swap', '91-lead')
    await lead.page.locator('[data-testid=swap-card]', { hasText: 'Familienfeier' }).getByRole('button', { name: 'Genehmigen' }).click()
    await lead.page.waitForSelector('text=Tausch genehmigt')
    await lead.context.close()
  }
}

// Dokumente + Pflichtfortbildungen: lead publishes an SOP, nurse confirms; training reported and confirmed
{
  const lead = await session('docs-lead', { email: 'mira.schulz@shiftcare.dev', viewport: { width: 1280, height: 900 }, theme: 'light' })
  const l = lead.page
  await l.goto(`${BASE}/documents`)
  await l.getByRole('button', { name: 'Neues Dokument' }).click()
  await l.setInputFiles('[data-testid=doc-file]', { name: 'sop-sturzprophylaxe.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test\n') })
  await l.fill('#doc-title', 'SOP Sturzprophylaxe')
  await l.locator('dialog[open]').getByRole('button', { name: 'Hochladen und veröffentlichen' }).click()
  await l.waitForSelector('text=Dokument veröffentlicht')
  await l.waitForSelector('text=0 von 4 bestätigt')

  await l.goto(`${BASE}/trainings?tab=ward`)
  await l.getByRole('button', { name: 'Neue Pflichtfortbildung' }).click()
  await l.fill('#req-title', 'Hygieneschulung')
  await l.locator('dialog[open]').getByRole('button', { name: 'Anlegen' }).click()
  await l.waitForSelector('text=Pflichtfortbildung angelegt')

  const nurse = await session('docs-nurse', { email: 'anna.becker@shiftcare.dev', viewport: { width: 390, height: 844 }, theme: 'light' })
  const n = nurse.page
  await n.goto(`${BASE}/`)
  await n.waitForSelector('text=Zu erledigen')
  await n.goto(`${BASE}/documents`)
  const card = n.locator('[data-testid=document-card]', { hasText: 'SOP Sturzprophylaxe' })
  await shot(n, 'docs', '95-nurse-documents', { full: false })
  await card.getByRole('button', { name: 'Gelesen und verstanden' }).click()
  await n.waitForSelector('text=Lesebestätigung gespeichert')
  await n.goto(`${BASE}/trainings`)
  const training = n.locator('[data-testid=training-card]', { hasText: 'Hygieneschulung' })
  await training.getByRole('button', { name: 'Teilnahme melden' }).click()
  await n.locator('dialog[open]').getByRole('button', { name: 'Speichern' }).click()
  await n.waitForSelector('text=Teilnahme gespeichert')
  await nurse.context.close()

  await l.goto(`${BASE}/documents`)
  await l.waitForSelector('text=1 von 4 bestätigt')
  await l.goto(`${BASE}/trainings?tab=ward`)
  await l.getByRole('button', { name: /Anna Becker: Hygieneschulung/ }).click()
  await l.locator('dialog[open]').getByRole('button', { name: 'Bestätigen' }).click()
  await l.waitForSelector('text=Teilnahme bestätigt')
  await shot(l, 'docs', '96-lead-trainings')
  await lead.context.close()
}

await browser.close()
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`✓ smoke test passed, screenshots in ${OUT}`)
