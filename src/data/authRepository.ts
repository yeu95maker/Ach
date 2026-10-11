import type { Session } from '@supabase/supabase-js'
import { AppError, toAppError } from '@/core/errors'
import { nativeRedirect } from '@/native/authCallback'
import { openAuthUrl } from '@/native/bootstrap'
import { isNative } from '@/native/platform'
import { db } from './client'

export type OAuthProvider = 'google' | 'azure'

/** Web: same origin. Native: pulshift://auth-callback[/path], handled in src/native/bootstrap.ts. */
const redirectTo = (path = '/') =>
  isNative() ? nativeRedirect(path) : `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`

export const authRepository = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await db().auth.getSession()
    if (error) throw toAppError(error)
    return data.session
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    const { data } = db().auth.onAuthStateChange((event, session) => callback(event, session))
    return () => data.subscription.unsubscribe()
  },

  async signInWithPassword(email: string, password: string) {
    const { error } = await db().auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new AppError('auth', error.message, error.code)
  },

  /** Google and Microsoft (Entra ID / Azure AD) via Supabase OAuth with PKCE. */
  async signInWithOAuth(provider: OAuthProvider) {
    const native = isNative()
    const { data, error } = await db().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo('/'),
        scopes: provider === 'azure' ? 'email openid profile' : undefined,
        skipBrowserRedirect: native,
      },
    })
    if (error) throw toAppError(error)
    if (native && data.url) await openAuthUrl(data.url)
  },

  async requestPasswordReset(email: string) {
    const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo('/reset-password') })
    if (error) throw toAppError(error)
  },

  async updatePassword(newPassword: string) {
    const { error } = await db().auth.updateUser({ password: newPassword })
    if (error) throw new AppError('validation', error.message, error.code)
  },

  /** Re-verifies the current password before sensitive changes. */
  async verifyPassword(email: string, password: string) {
    const { error } = await db().auth.signInWithPassword({ email, password })
    if (error) throw new AppError('auth', error.message, error.code)
  },

  /** scope 'others' signs out every other device (session management). */
  async signOut(scope: 'local' | 'global' | 'others' = 'local') {
    const { error } = await db().auth.signOut({ scope })
    if (error) throw toAppError(error)
  },
}
