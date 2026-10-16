/**
 * Store screenshots for App Store and Google Play, in all five app languages.
 *
 * Renders the real app (local test gateway + `npm run dev`, demo seed data)
 * inside a branded frame with a localized headline, in the exact pixel sizes
 * the stores require, plus the Google Play feature graphic.
 *
 *   PGHOST=/tmp PGPORT=54329 PGUSER=postgres PGDATABASE=shiftcare_test node scripts/e2e/gateway.mjs &
 *   npm run dev &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium PGHOST=/tmp PGPORT=54329 PGUSER=postgres PGDATABASE=shiftcare_test \
 *     node scripts/store/screenshots.mjs [--only=de,en]
 *
 * Use a database with only migrations + seed (no test runs) so the demo data
 * looks tidy; the script adds scripts/store/fixtures.sql (SOPs, trainings, a
 * pending shift swap) once.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pg from 'pg'
import { chromium } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://localhost:5173'
const ROOT = new URL('../../', import.meta.url).pathname
const STORE = join(ROOT, 'store')
const PASSWORD = 'ShiftCare!2026'
const NURSE = 'anna.becker@shiftcare.dev'
const LEAD = 'mira.schulz@shiftcare.dev'
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')

// Store locale folders (fastlane layout): [App Store, Google Play]
const LOCALES = { de: ['de-DE', 'de-DE'], en: ['en-US', 'en-US'], tr: ['tr', 'tr-TR'], ro: ['ro', 'ro'], pl: ['pl', 'pl-PL'] }

/**
 * Output canvas (store size) and the device viewport the app is rendered in.
 * The app image is scaled into the frame below the headline.
 */
const DEVICES = {
  iphone: { dir: (l) => `ios/screenshots/${l[0]}`, canvas: [1320, 2868], viewport: [430, 900], scale: 3, kind: 'phone' },
  ipad: { dir: (l) => `ios/screenshots-ipad/${l[0]}`, canvas: [2064, 2752], viewport: [834, 1040], scale: 2, kind: 'tablet' },
  androidPhone: { dir: (l) => `android/screenshots/phone/${l[1]}`, canvas: [1080, 2400], viewport: [384, 820], scale: 3, kind: 'phone' },
  androidTablet: { dir: (l) => `android/screenshots/tablet/${l[1]}`, canvas: [1600, 2560], viewport: [760, 1150], scale: 2, kind: 'tablet' },
}

/** Headlines per screen and language: [title, subtitle]. */
const CAPTIONS = {
  home: {
    de: ['Dein Tag auf einen Blick', 'Nächster Dienst, Stationsstatus, was zu erledigen ist'],
    en: ['Your day at a glance', 'Next shift, ward status and what is left to do'],
    tr: ['Günün tek bakışta', 'Sonraki vardiya, servis durumu, yapılacaklar'],
    ro: ['Ziua ta dintr-o privire', 'Următoarea tură, starea secției, ce e de făcut'],
    pl: ['Twój dzień w skrócie', 'Następny dyżur, stan oddziału, rzeczy do zrobienia'],
  },
  status: {
    de: ['Die Station auf einen Blick', 'Geplant gegenüber Soll, Krankmeldungen, offene Dienste'],
    en: ['Your ward at a glance', 'Planned vs. target, sick notes, open shifts'],
    tr: ['Servis tek bakışta', 'Planlanan ve hedef, hastalık bildirimleri, açık vardiyalar'],
    ro: ['Secția dintr-o privire', 'Planificat față de necesar, concedii medicale, ture libere'],
    pl: ['Oddział w jednym spojrzeniu', 'Obsada planowana i wymagana, zwolnienia, wolne dyżury'],
  },
  swaps: {
    de: ['Dienste tauschen – fair geregelt', 'Kollegin sagt zu, die Leitung genehmigt mit einem Tipp'],
    en: ['Swap shifts the fair way', 'Your colleague agrees, the ward lead approves in one tap'],
    tr: ['Vardiya değişimi, adil şekilde', 'Meslektaşın kabul eder, sorumlu tek dokunuşla onaylar'],
    ro: ['Schimbă ture, corect', 'Colegul acceptă, șefa de secție aprobă dintr-o atingere'],
    pl: ['Zamiana dyżurów bez chaosu', 'Współpracownik się zgadza, oddziałowa zatwierdza jednym dotknięciem'],
  },
  documents: {
    de: ['SOPs immer griffbereit', 'Lesen und mit „Gelesen und verstanden“ bestätigen'],
    en: ['SOPs always at hand', 'Read and confirm with “Read and understood”'],
    tr: ['SOP\'ler hep elinin altında', 'Oku ve „Okudum ve anladım“ ile onayla'],
    ro: ['SOP-urile mereu la îndemână', 'Citește și confirmă cu „Citit și înțeles”'],
    pl: ['SOP zawsze pod ręką', 'Czytaj i potwierdzaj zapoznanie jednym dotknięciem'],
  },
  trainings: {
    de: ['Pflichtfortbildungen im Blick', 'Status, Teilnahme melden, rechtzeitig erinnert werden'],
    en: ['Mandatory trainings in view', 'Status, report participation, timely reminders'],
    tr: ['Zorunlu eğitimler göz önünde', 'Durum, katılım bildirimi, zamanında hatırlatma'],
    ro: ['Instruirile obligatorii sub control', 'Stare, anunțarea participării, mementouri la timp'],
    pl: ['Szkolenia obowiązkowe pod kontrolą', 'Status, zgłaszanie udziału, przypomnienia na czas'],
  },
  trainingsWard: {
    de: ['Der Fortbildungsstand des Teams', 'Wer was nachweisen muss – auf einen Blick'],
    en: ["Your team's training status", 'Who needs to prove what – at a glance'],
    tr: ['Ekibin eğitim durumu', 'Kimin neyi belgelemesi gerektiği tek bakışta'],
    ro: ['Stadiul instruirilor echipei', 'Cine ce trebuie să dovedească – dintr-o privire'],
    pl: ['Stan szkoleń całego zespołu', 'Kto co musi udokumentować – w jednym widoku'],
  },
  schedule: {
    de: ['Dein Dienstplan, immer aktuell', 'Monat oder Liste, mit Stand der letzten Änderung'],
    en: ['Your roster, always up to date', 'Month or list view, with the latest change'],
    tr: ['Vardiya planın, hep güncel', 'Aylık veya liste, son değişiklik bilgisiyle'],
    ro: ['Programul tău, mereu actual', 'Lunar sau listă, cu ultima modificare'],
    pl: ['Twój grafik, zawsze aktualny', 'Miesiąc lub lista, z datą ostatniej zmiany'],
  },
  wishes: {
    de: ['Wünsche einfach eintragen', 'Wunschdienste und freie Tage für den nächsten Plan'],
    en: ['Enter your wishes easily', 'Preferred shifts and days off for the next roster'],
    tr: ['İsteklerini kolayca gir', 'Sonraki plan için vardiya ve izin günü istekleri'],
    ro: ['Dorințele tale, simplu', 'Ture dorite și zile libere pentru următorul program'],
    pl: ['Życzenia w kilka sekund', 'Wybrane dyżury i dni wolne na kolejny grafik'],
  },
  open: {
    de: ['Offene Dienste übernehmen', 'Nur wer passt, wird gefragt – melden mit einem Tipp'],
    en: ['Pick up open shifts', 'Only colleagues who fit are asked – one tap to volunteer'],
    tr: ['Açık vardiyaları üstlen', 'Yalnızca uygun olanlara sorulur, tek dokunuşla bildir'],
    ro: ['Preia ture libere', 'Sunt întrebați doar cei potriviți – o atingere ajunge'],
    pl: ['Bierz wolne dyżury', 'Pytani są tylko pasujący – zgłoś się jednym dotknięciem'],
  },
  news: {
    de: ['Alles Wichtige im Team', 'Fortbildungen, Teamsitzungen, Mitteilungen'],
    en: ['Everything your team needs to know', 'Training, team meetings, announcements'],
    tr: ['Ekip için önemli her şey', 'Eğitimler, ekip toplantıları, duyurular'],
    ro: ['Tot ce contează în echipă', 'Cursuri, ședințe de echipă, anunțuri'],
    pl: ['Wszystko, co ważne w zespole', 'Szkolenia, zebrania zespołu, komunikaty'],
  },
  cover: {
    de: ['Vertretung in Sekunden', 'Wer frei ist, die Ruhezeit einhält und Interesse hat'],
    en: ['Find cover in seconds', 'Who is free, keeps the rest period and is interested'],
    tr: ['Saniyeler içinde yedek', 'Kim boş, dinlenme süresine uyuyor ve istekli'],
    ro: ['Înlocuitor în câteva secunde', 'Cine e liber, respectă odihna și e interesat'],
    pl: ['Zastępstwo w kilka sekund', 'Kto jest wolny, ma czas odpoczynku i chęć'],
  },
  chat: {
    de: ['Das ganze Team im Gespräch', 'Stationschat für Fragen und kurze Absprachen'],
    en: ['Your whole ward in one chat', 'Ward chat for questions and quick updates'],
    tr: ['Tüm ekip tek sohbette', 'Sorular ve kısa haberler için servis sohbeti'],
    ro: ['Toată echipa într-un chat', 'Chatul secției pentru întrebări și noutăți'],
    pl: ['Cały zespół w jednym czacie', 'Czat oddziału do pytań i szybkich ustaleń'],
  },
  editor: {
    de: ['Der ganze Dienstplan in deiner Hand', 'Planen mit Wünschen, Ruhezeiten und offenen Diensten'],
    en: ['The whole roster in your hands', 'Plan with wishes, rest periods and open shifts'],
    tr: ['Tüm vardiya planı elinde', 'İstekler, dinlenme süreleri ve açık vardiyalarla planla'],
    ro: ['Tot programul în mâna ta', 'Planifică cu dorințe, odihnă și ture libere'],
    pl: ['Cały grafik w Twoich rękach', 'Planuj z życzeniami, odpoczynkiem i wolnymi dyżurami'],
  },
  wishesManage: {
    de: ['Wunschpläne auf einen Blick', 'Alle Wünsche des Teams übersichtlich'],
    en: ['All wish plans at a glance', "Your team's wishes, clearly laid out"],
    tr: ['İstek planları tek bakışta', 'Ekibin tüm istekleri düzenli'],
    ro: ['Planurile de dorințe dintr-o privire', 'Toate dorințele echipei, clar'],
    pl: ['Plany życzeń w jednym miejscu', 'Wszystkie życzenia zespołu przejrzyście'],
  },
}

const FEATURE = {
  de: ['Dienstplan für die Pflege', 'Dienste, Tausch, Urlaub, SOPs und Fortbildungen – in einer App'],
  en: ['Rostering for nursing teams', 'Shifts, swaps, leave, SOPs and trainings in one app'],
  tr: ['Hemşireler için vardiya planı', 'Vardiyalar, değişim, izin, SOP ve eğitimler tek uygulamada'],
  ro: ['Programul de ture pentru îngrijire', 'Ture, schimburi, concediu, SOP-uri și instruiri într-o aplicație'],
  pl: ['Grafik dyżurów dla pielęgniarek', 'Dyżury, zamiany, urlopy, SOP i szkolenia w jednej aplikacji'],
}

/** Which screens each device class shows, in order (the first ones matter most in the stores). */
const SCREENS = {
  // Google Play allows at most 8 per device class.
  phone: [
    { id: 'home', user: NURSE, path: '/' },
    { id: 'schedule', user: NURSE, path: '/schedule', theme: 'dark' },
    { id: 'swaps', user: LEAD, path: '/schedule/swaps' },
    { id: 'open', user: NURSE, path: '/schedule/open' },
    { id: 'documents', user: NURSE, path: '/documents' },
    { id: 'trainings', user: NURSE, path: '/trainings' },
    { id: 'chat', user: NURSE, path: '/team/chat' },
    { id: 'wishes', user: NURSE, path: '/schedule/wishes' },
  ],
  tablet: [
    { id: 'editor', user: LEAD, path: '/schedule/plan' },
    { id: 'status', user: LEAD, path: '/' },
    { id: 'swaps', user: LEAD, path: '/schedule/swaps' },
    { id: 'trainingsWard', user: LEAD, path: '/trainings?tab=ward' },
    { id: 'cover', user: LEAD, path: '/team?tab=sick', action: 'cover' },
    { id: 'documents', user: LEAD, path: '/documents' },
    { id: 'chat', user: LEAD, path: '/team/chat' },
    { id: 'schedule', user: NURSE, path: '/schedule' },
  ],
}

const messages = Object.fromEntries(Object.keys(LOCALES).map((l) => [l, JSON.parse(readFileSync(join(ROOT, `src/locales/${l}.json`), 'utf8'))]))
const t = (lang, key) => key.split('.').reduce((o, k) => o?.[k], messages[lang]) ?? key

const db = new pg.Client()
await db.connect()
// Screenshot-only demo content (SOPs, trainings, a pending swap), applied once.
if (!(await db.query(`select 1 from public.documents where id = '70000000-0000-4000-a000-000000000001'`)).rowCount) {
  await db.query(readFileSync(join(ROOT, 'scripts/store/fixtures.sql'), 'utf8'))
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const TMP = join(ROOT, 'node_modules/.tmp/store-shots')
mkdirSync(TMP, { recursive: true })

/** Raw app screenshot (PNG buffer) for one screen. */
async function capture(lang, device, screen) {
  const [w, h] = device.viewport
  const theme = screen.theme ?? 'light'
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: device.scale, colorScheme: theme, locale: lang, isMobile: device.kind === 'phone', hasTouch: true })
  await context.addInitScript(([th, l]) => {
    localStorage.setItem('shiftcare.theme', th)
    localStorage.setItem('shiftcare.locale', l)
  }, [theme, lang])
  const page = await context.newPage()
  await page.goto(`${BASE}/login`)
  await page.fill('#email', screen.user)
  await page.fill('#password', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL(`${BASE}/`)
  await page.goto(`${BASE}${screen.path}`)
  await page.waitForSelector('h1')
  await page.waitForLoadState('networkidle')
  if (screen.action === 'cover') {
    await page.getByRole('button', { name: t(lang, 'staffing.findCover') }).first().click()
    await page.waitForSelector(`dialog[open] >> text=${t(lang, 'staffing.legalHint')}`)
  }
  await page.waitForTimeout(900) // fonts, avatars, entry animations
  const buf = await page.screenshot()
  await context.close()
  return buf
}

/** Brand frame: headline on top, app screenshot in a rounded "device" below. */
async function compose(file, device, lang, captionId, shot) {
  const [W, H] = device.canvas
  const [vw, vh] = device.viewport
  const [title, subtitle] = CAPTIONS[captionId][lang]
  const phone = device.kind === 'phone'
  const pad = Math.round(W * 0.07)
  const radius = Math.round(W * (phone ? 0.075 : 0.03))
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const src = `data:image/png;base64,${shot.toString('base64')}`
  // Flex layout: the headline takes the height it needs (1–2 lines), the app image fills the rest.
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Inter; src: url('file://${ROOT}node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
    body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; font-family: Inter, system-ui, sans-serif; display: flex; flex-direction: column;
      background: radial-gradient(120% 70% at 50% 0%, #1b56c4 0%, #0f3d91 55%, #0a2c6b 100%); color: #fff; }
    header { flex: none; padding: ${Math.round(pad * 0.9)}px ${pad}px ${Math.round(pad * 0.6)}px; text-align: center; }
    h1 { margin: 0; font-size: ${Math.round(W * (phone ? 0.066 : 0.048))}px; line-height: 1.12; font-weight: 750; letter-spacing: -0.01em; }
    p { margin: ${Math.round(W * 0.016)}px 0 0; font-size: ${Math.round(W * (phone ? 0.034 : 0.025))}px; line-height: 1.3; color: #bfe9e6; font-weight: 500; }
    .stage { flex: 1; min-height: 0; display: flex; justify-content: center; align-items: flex-start; padding: 0 ${pad}px ${pad}px; }
    .stage img { display: block; max-width: 100%; max-height: 100%; aspect-ratio: ${vw} / ${vh}; border-radius: ${radius}px;
      box-shadow: 0 ${Math.round(W * 0.02)}px ${Math.round(W * 0.06)}px rgba(3, 12, 36, 0.45), 0 0 0 ${Math.max(4, Math.round(W * 0.006))}px rgba(255,255,255,0.14); }
  </style></head><body>
    <header><h1>${title}</h1><p>${subtitle}</p></header>
    <div class="stage"><img src="${src}"></div>
  </body></html>`)
  await page.evaluate(() => document.fonts.ready)
  const tmp = join(TMP, 'frame.png')
  await page.screenshot({ path: tmp })
  await page.close()
  mkdirSync(dirname(file), { recursive: true })
  // Opaque JPEG: no alpha channel (Apple) and small files.
  execFileSync('convert', [tmp, '-background', '#0F3D91', '-alpha', 'remove', '-alpha', 'off', '-quality', '90', '-sampling-factor', '4:2:0', file])
}

async function featureGraphic(lang, file) {
  const [title, subtitle] = FEATURE[lang]
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Inter; src: url('file://${ROOT}node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2') format('woff2'); font-weight: 100 900; }
    body { margin: 0; width: 1024px; height: 500px; overflow: hidden; font-family: Inter, sans-serif; color: #fff;
      background: radial-gradient(90% 120% at 15% 10%, #1b56c4 0%, #0f3d91 60%, #0a2c6b 100%); display: flex; align-items: center; gap: 44px; padding: 0 80px; box-sizing: border-box; }
    svg { width: 170px; height: 170px; flex: none; filter: drop-shadow(0 12px 30px rgba(3,12,36,.45)); }
    .name { font-size: 30px; font-weight: 700; color: #8fe3dc; letter-spacing: .02em; }
    h1 { margin: 6px 0 10px; font-size: 50px; line-height: 1.08; font-weight: 760; }
    p { margin: 0; font-size: 25px; color: #d7e4ff; line-height: 1.3; }
  </style></head><body>
    <svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#ffffff"/><path d="M19.5 17h10a15 15 0 0 1 0 30h-10z" fill="none" stroke="#0F3D91" stroke-width="5" stroke-linejoin="round"/><path d="M25.5 32.5l4 4 8-9" fill="none" stroke="#18B7B0" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div><div class="name">Dienstwerk</div><h1>${title}</h1><p>${subtitle}</p></div>
  </body></html>`)
  await page.evaluate(() => document.fonts.ready)
  mkdirSync(dirname(file), { recursive: true })
  const tmp = join(TMP, 'feature.png')
  await page.screenshot({ path: tmp })
  await page.close()
  execFileSync('convert', [tmp, '-alpha', 'off', `PNG24:${file}`])
}

for (const [lang, folders] of Object.entries(LOCALES)) {
  if (only && !only.includes(lang)) continue
  // The app follows the user's saved language after sign-in.
  await db.query(`update public.users set preferred_locale = $1 where email in ($2, $3)`, [lang, NURSE, LEAD])
  for (const device of Object.values(DEVICES)) {
    const dir = join(STORE, device.dir(folders))
    rmSync(dir, { recursive: true, force: true })
    for (const [i, screen] of SCREENS[device.kind].entries()) {
      const shot = await capture(lang, device, screen)
      const file = join(dir, `${String(i + 1).padStart(2, '0')}-${screen.id}.jpg`)
      await compose(file, device, lang, screen.id, shot)
      console.log(file.slice(ROOT.length))
    }
  }
  await featureGraphic(lang, join(STORE, 'android/metadata', folders[1], 'images/featureGraphic.png'))
}
await db.query(`update public.users set preferred_locale = 'de' where email in ($1, $2)`, [NURSE, LEAD])
await db.end()
await browser.close()
