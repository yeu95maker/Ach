// Generates the simple SVG illustrations in public/demo used by supabase/seed.sql.
import { mkdirSync, writeFileSync } from 'node:fs'

const out = new URL('../public/demo/', import.meta.url)
mkdirSync(out, { recursive: true })
const sky = (a, b) => `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#s)"/>`
const ground = (c) => `<rect y="430" width="800" height="170" fill="${c}"/>`
const tree = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-6" y="0" width="12" height="50" fill="#6b4a2b"/><circle cx="0" cy="-10" r="40" fill="#2f7d4f"/><circle cx="-22" cy="8" r="26" fill="#3a9160"/><circle cx="22" cy="6" r="28" fill="#2a6f45"/></g>`
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${body}</svg>`

const house = (wall, roof, sk) => svg(`${sky(...sk)}${ground('#7fb26a')}${tree(110, 380, 1.2)}${tree(700, 400)}
<polygon points="220,250 400,130 580,250" fill="${roof}"/><rect x="240" y="250" width="320" height="200" fill="${wall}"/>
<rect x="370" y="340" width="60" height="110" fill="#5b3b22"/><rect x="270" y="290" width="70" height="60" fill="#bfe3f5" stroke="#fff" stroke-width="6"/>
<rect x="460" y="290" width="70" height="60" fill="#bfe3f5" stroke="#fff" stroke-width="6"/><rect x="560" y="330" width="120" height="120" fill="#d8d2c4"/><rect x="575" y="350" width="90" height="100" fill="#9a958a"/>`)
const apartment = (wall, sk) => svg(`${sky(...sk)}${ground('#9cc28a')}${tree(120, 400)}
<rect x="250" y="120" width="300" height="330" fill="${wall}"/>${Array.from({ length: 5 }, (_, r) => Array.from({ length: 4 }, (_, c) =>
  `<rect x="${275 + c * 68}" y="${145 + r * 58}" width="44" height="36" fill="#bfe3f5"/>`).join('')).join('')}
<rect x="370" y="400" width="60" height="50" fill="#4b5563"/>${tree(660, 410, 0.9)}`)
const land = (grass, sk) => svg(`${sky(...sk)}<rect y="330" width="800" height="270" fill="${grass}"/>
<polygon points="0,330 200,250 420,330" fill="#8aa673"/><polygon points="300,330 560,230 800,330" fill="#7a9a66"/>
<rect x="180" y="380" width="440" height="160" fill="none" stroke="#f8fafc" stroke-width="6" stroke-dasharray="18 12"/>
${[200, 320, 440, 560, 620].map((x) => `<rect x="${x - 3}" y="370" width="6" height="22" fill="#f1f5f9"/>`).join('')}${tree(90, 360, 0.8)}${tree(720, 380, 0.9)}`)
const commercial = (wall, sk) => svg(`${sky(...sk)}${ground('#b8bcc2')}
<rect x="170" y="150" width="460" height="300" fill="${wall}"/>${Array.from({ length: 3 }, (_, r) => Array.from({ length: 6 }, (_, c) =>
  `<rect x="${195 + c * 72}" y="${175 + r * 70}" width="50" height="46" fill="#cde8f6"/>`).join('')).join('')}
<rect x="340" y="390" width="120" height="60" fill="#334155"/><rect x="170" y="130" width="460" height="22" fill="#1f2937"/>`)
const interior = (wall, floor) => svg(`<rect width="800" height="600" fill="${wall}"/><rect y="420" width="800" height="180" fill="${floor}"/>
<rect x="90" y="110" width="220" height="200" fill="#cfe9f7" stroke="#fff" stroke-width="12"/><rect x="380" y="320" width="300" height="110" rx="18" fill="#6b7280"/>
<rect x="380" y="290" width="300" height="50" rx="18" fill="#7c8590"/><rect x="430" y="440" width="200" height="12" fill="#a16207"/><circle cx="700" cy="200" r="30" fill="#fde68a"/>`)

const files = {
  'house-1': house('#f3e8d6', '#9a3412', ['#9fd3f2', '#e0f2fe']),
  'house-2': house('#e9eef2', '#334155', ['#bae6fd', '#f0f9ff']),
  'house-3': house('#fafaf9', '#1f2937', ['#fbcfa0', '#fef3c7']),
  'house-4': house('#efd9b4', '#7c2d12', ['#93c5fd', '#dbeafe']),
  'apartment-1': apartment('#e5e7eb', ['#a5d8ff', '#e7f5ff']),
  'apartment-2': apartment('#f5e6d3', ['#fcd9b6', '#fff4e6']),
  'land-1': land('#a3c585', ['#bfe3ff', '#f0f9ff']),
  'land-2': land('#c2b280', ['#fde7c4', '#fffaf0']),
  'land-3': land('#8fbf73', ['#9fd3f2', '#e0f2fe']),
  'commercial-1': commercial('#94a3b8', ['#bfdbfe', '#eff6ff']),
  'commercial-2': commercial('#d6d3d1', ['#c7d2fe', '#eef2ff']),
  'interior-1': interior('#f5f0e6', '#c8a27a'),
  'interior-2': interior('#eef2f3', '#9c7b5b'),
  'interior-3': interior('#fbf7ef', '#b08968'),
}
for (const [name, body] of Object.entries(files)) writeFileSync(new URL(`${name}.svg`, out), body)
console.log(`wrote ${Object.keys(files).length} images`)
