/**
 * Validates the store listings in store/ (fastlane layout) against the limits
 * of App Store Connect and Google Play, and the screenshots against the
 * required pixel sizes. Exit code 1 on any problem.
 *
 *   node scripts/store/check-listings.mjs            # texts + screenshots
 *   node scripts/store/check-listings.mjs --strict   # also fails on [placeholders] (use before submitting)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../../store/', import.meta.url).pathname
const strict = process.argv.includes('--strict')
const problems = []
const warnings = []

const LOCALES = { de: ['de-DE', 'de-DE'], en: ['en-US', 'en-US'], tr: ['tr', 'tr-TR'], ro: ['ro', 'ro'], pl: ['pl', 'pl-PL'] }
// App Store Connect: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
const IOS = { 'name.txt': 30, 'subtitle.txt': 30, 'keywords.txt': 100, 'promotional_text.txt': 170, 'description.txt': 4000, 'release_notes.txt': 4000 }
// Google Play: https://support.google.com/googleplay/android-developer/answer/9859152
const PLAY = { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000, 'changelogs/1.txt': 500 }

const chars = (s) => [...s].length
const read = (p) => readFileSync(p, 'utf8').replace(/\n$/, '')

function checkFile(path, max, label) {
  if (!existsSync(path)) return problems.push(`${label}: fehlt`)
  const text = read(path)
  if (!text.trim()) problems.push(`${label}: leer`)
  if (chars(text) > max) problems.push(`${label}: ${chars(text)} Zeichen, erlaubt ${max}`)
  if (/[<>]/.test(text) && !label.endsWith('description.txt')) problems.push(`${label}: enthält < oder >`)
  return text
}

for (const [lang, [ios, play]] of Object.entries(LOCALES)) {
  const i = join(ROOT, 'ios/metadata', ios)
  const texts = {}
  for (const [f, max] of Object.entries(IOS)) texts[f] = checkFile(join(i, f), max, `ios/${ios}/${f}`)
  const kw = texts['keywords.txt'] ?? ''
  if (/,\s/.test(kw)) problems.push(`ios/${ios}/keywords.txt: keine Leerzeichen nach Kommas (kostet Zeichen)`)
  const nameWords = new Set((texts['name.txt'] ?? '').toLowerCase().split(/[\s–-]+/))
  const dup = kw.toLowerCase().split(',').filter((k) => nameWords.has(k))
  if (dup.length) warnings.push(`ios/${ios}/keywords.txt: Wörter schon im Namen (${dup.join(', ')}) – zählen bei Apple nicht doppelt`)
  for (const f of ['privacy_url.txt', 'support_url.txt']) {
    const url = existsSync(join(i, f)) ? read(join(i, f)) : ''
    if (!/^https:\/\/\S+$/.test(url)) problems.push(`ios/${ios}/${f}: keine https-URL`)
  }
  const a = join(ROOT, 'android/metadata', play)
  for (const [f, max] of Object.entries(PLAY)) checkFile(join(a, f), max, `android/${play}/${f}`)
  void lang
}

// Placeholders like [Betreiber] must be filled in before submission.
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const placeholders = walk(ROOT)
  .filter((f) => f.endsWith('.txt'))
  .filter((f) => /\[[^\]]+\]/.test(read(f)))
  .map((f) => f.slice(ROOT.length))
if (placeholders.length) (strict ? problems : warnings).push(`Platzhalter noch ausfüllen: ${placeholders.join(', ')}`)

// Screenshots: exact sizes accepted by the stores.
const SHOTS = {
  'ios/screenshots': { sizes: [[1320, 2868]], label: 'iPhone 6,9"' },
  'ios/screenshots-ipad': { sizes: [[2064, 2752]], label: 'iPad 13"' },
  'android/screenshots/phone': { sizes: [[1080, 2400]], label: 'Android Telefon' },
  'android/screenshots/tablet': { sizes: [[1600, 2560]], label: 'Android Tablet 10"' },
}
function pngSize(file) {
  const b = readFileSync(file)
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
  // JPEG: walk segments to SOF0/SOF2
  let o = 2
  while (o < b.length) {
    const marker = b[o + 1]
    const len = b.readUInt16BE(o + 2)
    if (marker === 0xc0 || marker === 0xc2) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)]
    o += 2 + len
  }
  return [0, 0]
}
for (const [dir, { sizes, label }] of Object.entries(SHOTS)) {
  for (const [lang, [ios, play]] of Object.entries(LOCALES)) {
    const d = join(ROOT, dir, dir.startsWith('ios') ? ios : play)
    if (!existsSync(d)) {
      problems.push(`${label} ${lang}: keine Screenshots (${dir})`)
      continue
    }
    const files = readdirSync(d).filter((f) => /\.(png|jpe?g)$/.test(f))
    if (files.length < 2 || files.length > (dir.startsWith('ios') ? 10 : 8)) problems.push(`${label} ${lang}: ${files.length} Screenshots`)
    for (const f of files) {
      const [w, h] = pngSize(join(d, f))
      if (!sizes.some(([sw, sh]) => sw === w && sh === h)) problems.push(`${label} ${lang}/${f}: ${w}×${h}, erwartet ${sizes.map((s) => s.join('×')).join(' oder ')}`)
    }
  }
}
for (const [lang, [, play]] of Object.entries(LOCALES)) {
  const fg = join(ROOT, 'android/metadata', play, 'images/featureGraphic.png')
  if (!existsSync(fg)) problems.push(`Feature Graphic ${lang}: fehlt`)
  else if (pngSize(fg).join('×') !== '1024×500') problems.push(`Feature Graphic ${lang}: ${pngSize(fg).join('×')}, erwartet 1024×500`)
}
if (!existsSync(join(ROOT, 'android/icon-512.png')) || pngSize(join(ROOT, 'android/icon-512.png')).join('×') !== '512×512') problems.push('Google-Play-Icon 512×512 fehlt')

for (const w of warnings) console.warn(`! ${w}`)
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`)
  process.exit(1)
}
console.log(`✓ Store-Einträge: ${Object.keys(LOCALES).length} Sprachen, Texte und Grafiken im Rahmen`)
