#!/usr/bin/env node
/**
 * Points the native apps at the live website: writes the host of APP_URL into
 * the iOS associated domains (universal links) and the Android app-link filter.
 * Run before `npx cap sync` – the release workflow does this automatically.
 *   APP_URL=https://www.example.com node scripts/mobile/configure.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const appUrl = process.env.APP_URL
if (!appUrl) {
  console.error('APP_URL is not set (e.g. https://www.example.com)')
  process.exit(1)
}
const { protocol, host } = new URL(appUrl)
if (protocol !== 'https:') {
  console.error('APP_URL must use https – the stores and universal links require it')
  process.exit(1)
}

function patch(file, pattern, replacement) {
  const path = root + file
  const before = readFileSync(path, 'utf8')
  const after = before.replace(pattern, replacement)
  if (!pattern.test(before)) throw new Error(`pattern not found in ${file}`)
  writeFileSync(path, after)
  console.log(`${file}: ${host}`)
}

patch('ios/App/App/App.entitlements', /<string>applinks:[^<]*<\/string>/, `<string>applinks:${host}</string>`)
patch('android/app/src/main/AndroidManifest.xml', /android:scheme="https" android:host="[^"]*"/, `android:scheme="https" android:host="${host}"`)
