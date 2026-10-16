#!/usr/bin/env node
/**
 * Records a captioned phone-size walkthrough of the app (MP4, needs ffmpeg) against
 * a running app + test gateway with a fresh seed:
 *   node scripts/e2e/demo-video.mjs <out-dir>
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://localhost:3000'
const OUT = process.argv[2] ?? 'demo-video'
const PASSWORD = 'Marketplace!2026'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const size = { width: 390, height: 844 }
const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

// Screencast via CDP: frames arrive on change; durations are kept for ffmpeg's concat demuxer.
const FRAMES = `${OUT}/frames`
rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })
const frames = []
const cdp = await ctx.newCDPSession(page)
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  const file = `${FRAMES}/${String(frames.length).padStart(5, '0')}.jpg`
  writeFileSync(file, Buffer.from(data, 'base64'))
  frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000 })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 })
const wait = (ms) => page.waitForTimeout(ms)

/** Caption bar at the top of the screen (re-added after every navigation). */
let current = ''
async function caption(text, ms = 2600) {
  current = text
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption')
    if (!el) {
      el = document.createElement('div')
      el.id = 'demo-caption'
      el.style.cssText = 'position:fixed;left:10px;right:10px;top:62px;z-index:9999;background:rgba(17,24,39,.92);color:#fff;font:600 15px/1.35 system-ui;padding:10px 14px;border-radius:14px;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none'
      document.body.appendChild(el)
    }
    el.textContent = t
  }, text)
  await wait(ms)
}
page.on('framenavigated', () => setTimeout(() => current && caption(current, 0).catch(() => {}), 400))

async function slowScroll(px, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps)
    await wait(180)
  }
}
async function type(locator, text) {
  await locator.click()
  await locator.pressSequentially(text, { delay: 60 })
}
async function login(email) {
  await page.goto(`${BASE}/login`)
  await caption(`Sign in as ${email.split('@')[0]}`, 900)
  await type(page.getByLabel('Email'), email)
  await type(page.getByLabel('Password'), PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'))
}

try {
  // Buyer -------------------------------------------------------------------
  await page.goto(BASE)
  await caption('StandFinder – find property from verified providers in Harare', 3200)
  await caption('1. What are you looking for? → Houses')
  await page.getByRole('button', { name: /Houses/ }).click()
  await wait(600)
  await caption('2. Where? Harare – 3. Price: $100,000 – $250,000')
  await type(page.getByPlaceholder('Min').first(), '100000')
  await type(page.getByPlaceholder('Max').first(), '250000')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.waitForURL(/\/search/)
  await caption('Results – every listing shows its verified provider', 3000)
  await slowScroll(700)
  await caption('Switch to the map: price pins, tap for a preview')
  await page.goto(`${BASE}/search?city=Harare&view=map`)
  await page.locator('[data-marker]').first().waitFor()
  await wait(1200)
  await page.locator('[data-marker]').nth(2).click()
  await caption('🔒 pins are Premium listings', 2800)

  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000001`)
  await caption('Property page: photos, price, details', 2800)
  await slowScroll(900, 8)
  await caption('Features, description and the surrounding area', 2800)
  await slowScroll(1100, 8)
  await caption('Approximate location for privacy + nearby schools, shops, hospitals', 3200)
  await slowScroll(-2000, 6)
  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000005`)
  await caption('Members-only property: price, gallery and contact are locked', 3200)

  // Buyer account: save + message ------------------------------------------------
  await login('tariro@demo.property')
  await page.goto(`${BASE}/properties/e0000000-0000-4000-8000-000000000003`)
  await caption('Save a property ♡')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await wait(1200)
  await caption('Message the provider – inside the app, no phone numbers exposed')
  await page.getByRole('button', { name: 'Message provider' }).first().click()
  await wait(1500)
  await page.getByRole('button', { name: 'Send' }).click()
  await page.waitForURL(/\/messages\//)
  await caption('The property is attached to the conversation', 2600)
  await type(page.getByPlaceholder('Type a message…'), 'Could I view it on Saturday?')
  await page.keyboard.press('Enter')
  await wait(1500)

  // Premium ------------------------------------------------------------------------
  await page.goto(`${BASE}/membership?next=/properties/e0000000-0000-4000-8000-000000000005`)
  await caption('Premium: members-only listings, early access, advanced filters', 3000)
  await slowScroll(500)
  await caption('Payment via Paynow (EcoCash, OneMoney, cards) – demo mode here', 2800)
  await page.getByRole('button', { name: 'Become a member' }).click()
  await page.waitForURL(/e0000000-0000-4000-8000-000000000005/)
  await caption('Unlocked: price, photos and provider are now visible', 3200)

  // Provider ------------------------------------------------------------------------
  await page.context().clearCookies()
  await login('abc@demo.property')
  await page.goto(`${BASE}/provider`)
  await caption('Provider dashboard: views, inquiries and saves per listing', 3200)
  await slowScroll(600)
  await page.goto(`${BASE}/messages`)
  await caption('Inbox – the buyer\'s message has arrived', 2600)
  await page.goto(`${BASE}/provider/properties/new`)
  await caption('Add property: 9 simple steps', 2400)
  await page.getByRole('button', { name: 'Land', exact: true }).click()
  await wait(800)
  await page.getByRole('button', { name: 'Next' }).click()
  await caption('Location: area + pin on the map')
  await page.goto(`${BASE}/provider/import`)
  await caption('Or import a whole spreadsheet of stands at once', 3000)

  // Admin ----------------------------------------------------------------------------
  await page.context().clearCookies()
  await login('admin@demo.property')
  await page.goto(`${BASE}/admin`)
  await caption('Admin: marketplace numbers – supply, demand, trust, revenue', 3200)
  await slowScroll(700)
  await page.goto(`${BASE}/admin?tab=providers`)
  await caption('Verify providers before they can publish', 3000)
  await page.goto(`${BASE}/admin?tab=properties`)
  await caption('Approve or reject new listings', 3000)
  await page.goto(`${BASE}/admin?tab=partners`)
  await caption('Field partners: who brought which provider', 3000)

  await page.context().clearCookies()
  await page.goto(`${BASE}/for-providers?ref=HRE-TINO`)
  await caption('The link your partners send to agents and developers', 3200)
  await slowScroll(800)
  await caption('StandFinder – Discover · Trust · Connect', 3000)
} finally {
  await cdp.send('Page.stopScreencast').catch(() => {})
  await ctx.close()
  await browser.close()
  const lines = ['ffconcat version 1.0']
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 1.5
    lines.push(`file '${f.file.split('/').pop()}'`, `duration ${Math.max(0.04, next - f.t).toFixed(3)}`)
  })
  lines.push(`file '${frames.at(-1).file.split('/').pop()}'`)
  writeFileSync(`${FRAMES}/list.ffconcat`, lines.join('\n'))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${FRAMES}/list.ffconcat`,
    '-vf', 'scale=780:-2,fps=25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', `${OUT}/property-finder-demo.mp4`])
  rmSync(FRAMES, { recursive: true, force: true })
  console.log(`${OUT}/property-finder-demo.mp4 (${frames.length} frames)`)
}
