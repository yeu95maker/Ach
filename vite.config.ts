import { createHash } from 'node:crypto'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import pkg from './package.json' with { type: 'json' }

/**
 * Content-Security-Policy for production builds (web, iOS, Android). Delivered
 * as a <meta> tag because GitHub Pages and the native web views cannot set
 * response headers. Only the app itself and the configured Supabase project
 * may be contacted; inline scripts are allowed by hash only. Not applied in
 * development, where Vite injects its own inline scripts.
 */
function contentSecurityPolicy(supabaseUrl: string | undefined): Plugin {
  let api: string[] = []
  if (supabaseUrl) {
    const u = new URL(supabaseUrl)
    api = [u.origin, `${u.protocol === 'https:' ? 'wss' : 'ws'}://${u.host}`]
  }
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        )
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: blob: ${api[0] ?? ''}`.trim(),
          "font-src 'self' data:",
          `connect-src 'self' ${api.join(' ')}`.trim(),
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ')
        return html.replace(
          /<meta charset="UTF-8" \/>/i,
          (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
        )
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // Sub-path deployments (e.g. GitHub Pages at /Ach/) set BASE_PATH at build time.
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_SUPABASE_URL)],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5173 },
    build: {
      target: 'es2022',
      // No source maps in shipped bundles (web, App Store, Play Store).
      sourcemap: false,
    },
    test: {
      include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
      environment: 'node',
    },
  }
})
