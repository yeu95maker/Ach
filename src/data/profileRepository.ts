import type { SpokenLanguage, ThemePreference } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'

export interface ProfilePatch {
  firstName?: string
  lastName?: string
  phone?: string | null
  preferredLocale?: string
  theme?: ThemePreference
  avatarPath?: string | null
}

const AVATAR_TTL_SECONDS = 60 * 60
const avatarCache = new Map<string, { url: string; expires: number }>()

export const profileRepository = {
  async update(userId: string, patch: ProfilePatch): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.firstName !== undefined) row.first_name = patch.firstName.trim()
    if (patch.lastName !== undefined) row.last_name = patch.lastName.trim()
    if (patch.phone !== undefined) row.phone = patch.phone?.trim() || null
    if (patch.preferredLocale !== undefined) row.preferred_locale = patch.preferredLocale
    if (patch.theme !== undefined) row.theme = patch.theme
    if (patch.avatarPath !== undefined) row.avatar_path = patch.avatarPath
    if (Object.keys(row).length === 0) return
    unwrap(await db().from('users').update(row).eq('id', userId))
  },

  async fetchLanguageCatalogue(): Promise<{ code: string; nativeName: string }[]> {
    const rows = unwrapList<{ code: string; native_name: string }>(
      await db().from('languages').select('code, native_name').eq('is_active', true).order('sort_order').order('native_name'),
    )
    return rows.map((r) => ({ code: r.code, nativeName: r.native_name }))
  },

  /** Replace the spoken languages of the user. */
  async setLanguages(userId: string, languages: SpokenLanguage[]): Promise<void> {
    const keep = languages.map((l) => l.code)
    const del = db().from('user_languages').delete().eq('user_id', userId)
    unwrap(await (keep.length ? del.not('language_code', 'in', `(${keep.join(',')})`) : del))
    if (languages.length) {
      unwrap(
        await db()
          .from('user_languages')
          .upsert(languages.map((l) => ({ user_id: userId, language_code: l.code, proficiency: l.proficiency }))),
      )
    }
  },

  async uploadAvatar(userId: string, file: Blob): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/avatar-${Date.now()}.${ext}`
    const { error } = await db().storage.from('avatars').upload(path, file, { contentType: file.type, cacheControl: '3600' })
    if (error) throw error
    await this.update(userId, { avatarPath: path })
    return path
  },

  /** Signed avatar URLs, batched and cached (private bucket). */
  async avatarUrls(paths: string[]): Promise<Record<string, string>> {
    const now = Date.now()
    const result: Record<string, string> = {}
    const missing: string[] = []
    for (const p of new Set(paths)) {
      const hit = avatarCache.get(p)
      if (hit && hit.expires > now) result[p] = hit.url
      else missing.push(p)
    }
    if (missing.length) {
      const { data, error } = await db().storage.from('avatars').createSignedUrls(missing, AVATAR_TTL_SECONDS)
      if (!error && data) {
        for (const item of data) {
          if (item.path && item.signedUrl) {
            avatarCache.set(item.path, { url: item.signedUrl, expires: now + (AVATAR_TTL_SECONDS - 60) * 1000 })
            result[item.path] = item.signedUrl
          }
        }
      }
    }
    return result
  },
}
