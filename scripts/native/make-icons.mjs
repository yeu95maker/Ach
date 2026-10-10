/**
 * Renders app icons and launch screens for iOS, Android and Google Play from
 * the ShiftCare mark (resources/icon.svg). Pixel-exact via headless Chromium;
 * ImageMagick strips the alpha channel where Apple requires opaque images.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/native/make-icons.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const BLUE = '#0F3D91'
const TEAL = '#18B7B0'
// The pulse line from the mark, in the 64×64 design grid.
const PULSE = `<path d="M20 34.5h7l3.5-9 6 17 3.5-8H46" fill="none" stroke="${TEAL}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`

/** shape: square (full bleed) | rounded | circle | none (transparent background, adaptive foreground). scale: size of the mark. */
function svg({ shape, scale = 1 }) {
  const bg =
    shape === 'square' ? `<rect width="64" height="64" fill="${BLUE}"/>`
    : shape === 'rounded' ? `<rect x="2" y="2" width="60" height="60" rx="14" fill="${BLUE}"/>`
    : shape === 'circle' ? `<circle cx="32" cy="32" r="30" fill="${BLUE}"/>`
    : ''
  const t = (1 - scale) * 33 // keep the pulse centred (its bbox centre is ≈ 33,34)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${bg}<g transform="translate(${t} ${t}) scale(${scale})">${PULSE}</g></svg>`
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage()

async function render(file, w, h, { shape, scale, background = 'transparent', markSize = Math.min(w, h), opaque = false }) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(
    `<html><body style="margin:0;width:${w}px;height:${h}px;background:${background};display:flex;align-items:center;justify-content:center">` +
      `<div style="width:${markSize}px;height:${markSize}px">${svg({ shape, scale })}</div></body></html>`,
  )
  mkdirSync(dirname(file), { recursive: true })
  await page.screenshot({ path: file, omitBackground: background === 'transparent' })
  if (opaque) execFileSync('convert', [file, '-background', BLUE, '-alpha', 'remove', '-alpha', 'off', `PNG24:${file}`])
  console.log(file, `${w}x${h}`)
}

// iOS: one 1024 icon, full bleed and opaque (iOS applies the rounded mask).
await render('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, { shape: 'square', opaque: true })
// iOS launch screen (scaleAspectFill, centre stays visible on every device).
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  await render(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, 2732, 2732, { shape: 'none', background: BLUE, markSize: 520, opaque: true })

// Android launcher icons.
const RES = 'android/app/src/main/res'
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [d, k] of Object.entries(DENSITIES)) {
  await render(`${RES}/mipmap-${d}/ic_launcher.png`, 48 * k, 48 * k, { shape: 'rounded' })
  await render(`${RES}/mipmap-${d}/ic_launcher_round.png`, 48 * k, 48 * k, { shape: 'circle' })
  // Adaptive foreground: 108 dp canvas, the mark stays inside the 66 dp safe zone.
  await render(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, 108 * k, 108 * k, { shape: 'none', scale: 0.62 })
}
// Android launch screens (pre-Android-12 window background).
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  await render(`${RES}/drawable-port-${d}/splash.png`, w, h, { shape: 'none', background: BLUE, markSize: Math.round(w * 0.42), opaque: true })
  await render(`${RES}/drawable-land-${d}/splash.png`, h, w, { shape: 'none', background: BLUE, markSize: Math.round(w * 0.42), opaque: true })
}
await render(`${RES}/drawable/splash.png`, 480, 320, { shape: 'none', background: BLUE, markSize: 140, opaque: true })

// Store listing: Google Play hi-res icon (512, Google applies the mask).
await render('store/android/icon-512.png', 512, 512, { shape: 'square', opaque: true })

await browser.close()
