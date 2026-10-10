import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/core/i18n'
import '@/styles/index.css'
import { bootstrapNative, hideSplash } from '@/native/bootstrap'

// Native shells swap in Keychain/Keystore session storage before the app (and
// with it the Supabase client) is loaded; in the browser this resolves at once.
void bootstrapNative()
  .catch((e: unknown) => console.error('native bootstrap failed', e))
  .then(() => import('@/app/App'))
  .then(({ App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    hideSplash()
  })
