#!/usr/bin/env node
/**
 * Records a guided video tour of ShiftCare (German captions).
 *   node scripts/e2e/demo-tour.mjs [outDir]
 * Requires: test gateway + `npm run dev` (see scripts/e2e/gateway.mjs), fresh seed.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const FFMPEG = process.env.FFMPEG ?? '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux'
const FPS = 12

/** Records a page via the CDP screencast and encodes it with ffmpeg (VP8/WebM). */
async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    frames.push({ t: metadata.timestamp * 1000, buf: Buffer.from(data, 'base64') })
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })
  return async (file) => {
    await cdp.send('Page.stopScreencast').catch(() => {})
    if (!frames.length) return
    const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', 'pipe:0',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libvpx', '-b:v', '2M', '-crf', '10', '-pix_fmt', 'yuv420p', file])
    ff.stderr.on('data', (d) => process.stderr.write(d))
    ff.stdin.on('error', () => {})
    const done = new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))))
    const start = frames[0].t
    const end = frames[frames.length - 1].t + 1500
    let i = 0
    for (let t = start; t <= end; t += 1000 / FPS) {
      while (i + 1 < frames.length && frames[i + 1].t <= t) i++
      if (!ff.stdin.write(frames[i].buf)) await new Promise((r) => ff.stdin.once('drain', r))
    }
    ff.stdin.end()
    await done
  }
}

const BASE = process.env.APP_URL ?? 'http://localhost:5173'
const OUT = process.argv[2] ?? 'demo-videos'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

/** Caption bar injected into the page so the video explains itself. */
async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById('__demo_caption')
    if (!el) {
      el = document.createElement('div')
      el.id = '__demo_caption'
      el.style.cssText =
        'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;max-width:92%;padding:10px 18px;border-radius:14px;' +
        'background:rgba(11,27,51,.9);color:#fff;font:600 15px/1.35 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);text-align:center;pointer-events:none'
      document.body.appendChild(el)
    }
    el.textContent = t
  }, text)
  await page.waitForTimeout(2200)
}

async function start(name, viewport, email) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'de' })
  await context.addInitScript(() => localStorage.setItem('shiftcare.theme', 'light'))
  const page = await context.newPage()
  const stop = await startRecording(page)
  await page.goto(`${BASE}/login`)
  await caption(page, 'Anmeldung – E-Mail, Microsoft oder Google')
  await page.locator('#email').pressSequentially(email, { delay: 25 })
  await page.locator('#password').pressSequentially('ShiftCare!2026', { delay: 25 })
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`)
  await page.waitForTimeout(1500)
  return { context, page, name, stop }
}

async function finish({ context, name, stop }) {
  await stop(join(OUT, `${name}.webm`))
  await context.close()
}

const scroll = (page, y) => page.evaluate((v) => window.scrollTo({ top: v, behavior: 'smooth' }), y)

// ---------------------------------------------------------------- Pflegekraft (Smartphone)
{
  const s = await start('1-pflegekraft-smartphone', { width: 390, height: 844 }, 'leyla.yilmaz@shiftcare.dev')
  const p = s.page
  await caption(p, 'Dashboard: heutiger Status, nächster Dienst, Wunschplan-Hinweis')
  await scroll(p, 600)
  await caption(p, 'Schnellzugriffe, Mitteilungen, Anträge, offene Dienste')
  await scroll(p, 0)

  await p.getByRole('link', { name: 'Dienstplan' }).last().click()
  await p.waitForTimeout(1200)
  await caption(p, 'Dienstplan – Monatsansicht mit Farbcodierung')
  await p.locator('button[aria-label*=":"]').filter({ has: p.locator('.bg-primary') }).first().click()
  await p.waitForSelector('dialog[open]')
  await caption(p, 'Antippen: Datum, Uhrzeit, Station, Kollegen im Dienst')
  await p.keyboard.press('Escape')

  await p.goto(`${BASE}/schedule/wishes`)
  await p.waitForTimeout(1200)
  await caption(p, 'Wunschplan: Wunsch wählen, dann Tage antippen')
  const cells = p.locator('[role=gridcell]')
  for (const i of [4, 5, 6]) {
    await cells.nth(i).click()
    await p.waitForTimeout(250)
  }
  await p.getByRole('radio', { name: 'Nacht' }).click()
  for (const i of [11, 12]) {
    await cells.nth(i).click()
    await p.waitForTimeout(250)
  }
  await p.getByRole('radio', { name: 'Nicht verfügbar' }).click()
  await cells.nth(17).click()
  await caption(p, '6 Wünsche in wenigen Sekunden – jetzt einreichen')
  await p.getByRole('button', { name: /Wunschplan einreichen/ }).click()
  await p.waitForSelector('text=Dein Wunschplan wurde erfolgreich eingereicht.')
  await caption(p, 'Bestätigung – Wünsche sind keine Zusage, die Leitung plant')

  await p.goto(`${BASE}/requests/leave/new`)
  await p.waitForTimeout(800)
  await caption(p, 'Urlaub beantragen: Art, Zeitraum, Arbeitstage automatisch')
  await p.fill('#start', '2027-03-01')
  await p.fill('#end', '2027-03-05')
  await p.waitForTimeout(800)
  await p.click('button[type=submit]')
  await p.waitForURL(`${BASE}/requests`)
  await caption(p, 'Antrag ist „Offen“ – die Stationsleitung wird benachrichtigt')

  await p.goto(`${BASE}/team`)
  await p.waitForTimeout(1200)
  await caption(p, 'Team: Wer ist im Dienst? Wer ist heute krank? (ohne Grund, ohne Urlaub)')

  await p.goto(`${BASE}/profile`)
  await p.waitForTimeout(1000)
  await caption(p, 'Profil: Foto, Kontakt, Sprachen, App-Sprache, Dark Mode, Passwort')
  await p.getByRole('tab', { name: 'Dunkel' }).click()
  await p.waitForTimeout(800)
  await caption(p, 'Eigener Dark Mode – nicht einfach invertiert')
  await p.goto(`${BASE}/`)
  await p.waitForTimeout(1500)
  await finish(s)
}

// ---------------------------------------------------------------- Stationsleitung (Desktop)
{
  const s = await start('2-stationsleitung-desktop', { width: 1440, height: 900 }, 'mira.schulz@shiftcare.dev')
  const p = s.page
  await caption(p, 'Stationsleitung: offene Urlaubsanträge und Krankmeldungen auf einen Blick')

  await p.goto(`${BASE}/team?tab=requests`)
  await p.waitForTimeout(1200)
  await caption(p, 'Urlaubsanträge genehmigen – mit Notiz an die Mitarbeiterin')
  const card = p.locator('div.rounded-\\[var\\(--radius-card\\)\\]', { hasText: 'März 2027' }).first()
  await card.getByRole('button', { name: 'Genehmigen' }).click()
  await p.locator('#decision-note').pressSequentially('Gute Erholung!', { delay: 30 })
  await p.locator('dialog[open]').getByRole('button', { name: 'Genehmigen' }).click()
  await p.waitForSelector('text=Antrag genehmigt')
  await p.waitForTimeout(800)

  await p.goto(`${BASE}/team?tab=sick`)
  await p.waitForTimeout(1000)
  await caption(p, 'Krankmeldungen: Kommentar verschlüsselt, nur für die Leitung lesbar')
  await p.getByRole('button', { name: 'Kommentar anzeigen' }).first().click()
  await p.waitForTimeout(1500)

  await p.goto(`${BASE}/schedule/wishes/manage`)
  await p.waitForTimeout(1500)
  await caption(p, 'Wunschpläne: Wunsch (farbig) und geplanter Dienst (Kürzel) nebeneinander')
  await caption(p, 'Rot umrandet = Plan widerspricht dem Wunsch')

  await p.goto(`${BASE}/schedule/plan`)
  await p.waitForTimeout(1800)
  await caption(p, 'Dienstplan-Editor: Dienst wählen, Zellen antippen – sofort gespeichert')
  const cell = (name, day) => p.locator('tr', { hasText: name }).locator('td').nth(day - 1).locator('button')
  await p.getByRole('radio').filter({ hasText: 'Frühdienst' }).click()
  for (const d of [2, 3, 4]) {
    await cell('Jonas', d).click()
    await p.waitForTimeout(500)
  }
  await p.getByRole('radio').filter({ hasText: 'Spätdienst' }).click()
  await cell('Jonas', 5).click()
  await p.waitForTimeout(600)
  await p.getByRole('radio').filter({ hasText: 'Frühdienst' }).click()
  await cell('Jonas', 6).click()
  await p.waitForTimeout(1000)
  await caption(p, 'Warnung: Ruhezeit unter 11 Stunden (Spät → Früh)')
  await p.getByRole('radio').filter({ hasText: 'Ansehen' }).click()
  await cell('Anna', 5).click()
  await p.waitForSelector('dialog[open]')
  await caption(p, 'Details: geplant vs. Wunsch – Entscheidung bleibt bei der Leitung')
  await p.keyboard.press('Escape')
  await scroll(p, 500)
  await caption(p, 'Besetzung pro Tag und Liste aller Hinweise')
  await scroll(p, 0)
  await p.getByRole('button', { name: 'Veröffentlichen' }).click()
  await p.waitForTimeout(800)
  await p.locator('dialog[open]').getByRole('button', { name: 'Jetzt veröffentlichen' }).click()
  await p.waitForSelector('text=Veröffentlicht · v1')
  await caption(p, 'Veröffentlicht – das Team wird benachrichtigt')
  await finish(s)
}

await browser.close()
console.log(`✓ demo videos in ${OUT}:`, readdirSync(OUT).filter((f) => f.endsWith('.webm')).join(', '))
