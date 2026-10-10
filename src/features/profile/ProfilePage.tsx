import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Building2,
  Camera,
  ClipboardList,
  Globe,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  MonitorSmartphone,
  Moon,
  Pencil,
  Phone,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PersonAvatar } from '@/components/PersonAvatar'
import { errorMessageKey } from '@/core/errors'
import { changeLanguage, UI_LANGUAGES, type UiLanguage } from '@/core/i18n'
import { useTheme } from '@/core/theme'
import { authRepository } from '@/data/authRepository'
import { profileRepository } from '@/data/profileRepository'
import { teamRepository } from '@/data/teamRepository'
import { canAny } from '@/domain/permissions'
import type { ThemePreference } from '@/domain/types'
import { currentPushState, disablePush, enablePush, type PushState } from '@/features/notifications/push'
import { queryKeys } from '@/features/queryKeys'
import { useCurrentUser, useEmployment, useTenant } from '@/features/tenant/TenantProvider'
import { Badge, Button, Card, IconButton, ListGroup, ListRow, PageHeader, SectionTitle, SegmentedControl, Select, Spinner, useToast } from '@/ui'
import { ChangePasswordSheet } from './ChangePasswordSheet'
import { EditProfileSheet } from './EditProfileSheet'
import { LanguagesSheet } from './LanguagesSheet'
import { resizeImage } from './resizeImage'

const NATIVE_LANGUAGE_NAMES: Record<UiLanguage, string> = { de: 'Deutsch', en: 'English', tr: 'Türkçe', ro: 'Română', pl: 'Polski' }

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const user = useCurrentUser()
  const employment = useEmployment()
  const { context, selectEmployment } = useTenant()
  const { preference, setPreference } = useTheme()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [sheet, setSheet] = useState<'edit' | 'languages' | 'password' | null>(null)
  const [pushState, setPushState] = useState<PushState>(currentPushState)

  const directory = useQuery({
    queryKey: queryKeys.directory(employment.hospital.id),
    queryFn: () => teamRepository.fetchDirectory(employment.hospital.id),
  })
  const me = directory.data?.find((c) => c.employeeId === employment.employeeId)

  const refreshContext = () => queryClient.invalidateQueries({ queryKey: queryKeys.context(user.id) })

  const upload = useMutation({
    mutationFn: async (file: File) => profileRepository.uploadAvatar(user.id, await resizeImage(file)),
    onSuccess: () => {
      void refreshContext()
      void queryClient.invalidateQueries({ queryKey: queryKeys.directory(employment.hospital.id) })
      toast.show({ tone: 'success', title: t('profile.photoUpdated') })
    },
    onError: (e) => toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) }),
  })

  const persist = useMutation({
    mutationFn: (patch: { preferredLocale?: string; theme?: ThemePreference }) => profileRepository.update(user.id, patch),
    onSuccess: () => void refreshContext(),
  })

  const onLanguage = (lng: UiLanguage) => {
    void changeLanguage(lng)
    persist.mutate({ preferredLocale: lng })
  }
  const onTheme = (theme: ThemePreference) => {
    setPreference(theme)
    persist.mutate({ theme })
  }

  const togglePush = async () => {
    try {
      if (pushState === 'granted') {
        await disablePush()
        setPushState('default')
      } else {
        setPushState(await enablePush())
      }
    } catch {
      toast.show({ tone: 'error', title: t('errors.title') })
    }
  }

  const signOutOthers = async () => {
    try {
      await authRepository.signOut('others')
      toast.show({ tone: 'success', title: t('profile.otherSessionsEnded') })
    } catch (e) {
      toast.show({ tone: 'error', title: t('errors.title'), description: t(errorMessageKey(e)) })
    }
  }

  const spoken = context?.languages ?? []

  return (
    <>
      <PageHeader title={t('profile.title')} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        {/* Identity */}
        <div className="space-y-6">
          <Card padding="lg" className="relative overflow-hidden text-center">
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-primary to-[#1B5BC7] dark:from-primary-soft dark:to-surface-3" aria-hidden />
            <div className="relative mt-6 inline-block">
              <PersonAvatar person={user} size="xl" ring />
              <IconButton
                label={t('profile.changePhoto')}
                variant="secondary"
                className="absolute right-0 bottom-0 size-10 shadow-lg"
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? <Spinner className="size-4" /> : <Camera className="size-[18px]" />}
              </IconButton>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) upload.mutate(file)
                  e.target.value = ''
                }}
              />
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">{`${user.firstName} ${user.lastName}`}</h2>
            <p className="text-[15px] text-text-2">{employment.jobTitle}</p>
            <p className="mt-1 text-sm text-text-3">
              {employment.units.map((u) => u.name).join(' · ') || employment.hospital.name}
            </p>
            {!!me?.qualifications.length && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {me.qualifications.map((q) => (
                  <Badge key={q.id} tone="primary">
                    {q.name}
                  </Badge>
                ))}
              </div>
            )}
            <Button variant="secondary" className="mt-6" icon={<Pencil className="size-4" />} onClick={() => setSheet('edit')}>
              {t('profile.edit')}
            </Button>
          </Card>

          <section>
            <SectionTitle>{t('profile.contact')}</SectionTitle>
            <ListGroup>
              <ListRow icon={<Mail />} title={user.email} subtitle={t('auth.email')} />
              <ListRow icon={<Phone />} title={user.phone || t('profile.noPhone')} subtitle={t('profile.phone')} onClick={() => setSheet('edit')} />
              <ListRow
                icon={<Languages />}
                title={spoken.length ? spoken.map((l) => l.code.toUpperCase()).join(' · ') : t('profile.noLanguages')}
                subtitle={t('profile.languages')}
                onClick={() => setSheet('languages')}
              />
            </ListGroup>
          </section>

          {(context?.employments.length ?? 0) > 1 && (
            <section>
              <SectionTitle>{t('profile.employments')}</SectionTitle>
              <ListGroup>
                {context!.employments.map((e) => (
                  <ListRow
                    key={e.employeeId}
                    icon={<Building2 />}
                    title={e.hospital.name}
                    subtitle={e.jobTitle}
                    onClick={() => selectEmployment(e.employeeId)}
                    chevron={false}
                    trailing={e.employeeId === employment.employeeId ? <Badge tone="success">{t('profile.active')}</Badge> : undefined}
                  />
                ))}
              </ListGroup>
            </section>
          )}
        </div>

        {/* Settings */}
        <div className="space-y-6">
          <section>
            <SectionTitle>{t('profile.myArea')}</SectionTitle>
            <ListGroup>
              <ListRow icon={<ClipboardList />} title={t('requests.title')} subtitle={t('requests.subtitle')} to="/requests" />
              {canAny(employment, ['employees.manage', 'roles.assign', 'organization.manage', 'integrations.manage']) && (
                <ListRow icon={<Settings2 />} title={t('admin.title')} subtitle={t('admin.subtitle')} to="/admin" />
              )}
            </ListGroup>
          </section>

          <section>
            <SectionTitle>{t('profile.settings')}</SectionTitle>
            <ListGroup>
              <ListRow
                icon={<Globe />}
                title={t('profile.appLanguage')}
                chevron={false}
                trailing={
                  <Select aria-label={t('profile.appLanguage')} value={i18n.language} onChange={(e) => onLanguage(e.target.value as UiLanguage)} className="h-10 w-36 text-sm">
                    {UI_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {NATIVE_LANGUAGE_NAMES[l]}
                      </option>
                    ))}
                  </Select>
                }
              />
              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <span className="flex flex-1 items-center gap-3.5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-text-2">
                    <Moon className="size-5" />
                  </span>
                  <span className="text-[15px] font-medium">{t('profile.appearance')}</span>
                </span>
                <SegmentedControl<ThemePreference>
                  label={t('profile.appearance')}
                  value={preference}
                  onChange={onTheme}
                  className="w-full sm:w-72"
                  options={[
                    { value: 'system', label: t('profile.themeSystem') },
                    { value: 'light', label: t('profile.themeLight') },
                    { value: 'dark', label: t('profile.themeDark') },
                  ]}
                />
              </div>
              <ListRow
                icon={<Bell />}
                title={t('profile.pushNotifications')}
                subtitle={t(`profile.push.${pushState}`)}
                chevron={false}
                trailing={
                  pushState !== 'unsupported' &&
                  pushState !== 'denied' && (
                    <Button size="sm" variant={pushState === 'granted' ? 'secondary' : 'accent'} onClick={togglePush}>
                      {pushState === 'granted' ? t('profile.disable') : t('profile.enable')}
                    </Button>
                  )
                }
              />
            </ListGroup>
          </section>

          <section>
            <SectionTitle>{t('profile.security')}</SectionTitle>
            <ListGroup>
              <ListRow icon={<KeyRound />} title={t('profile.changePassword')} onClick={() => setSheet('password')} />
              <ListRow icon={<MonitorSmartphone />} title={t('profile.signOutOthers')} subtitle={t('profile.signOutOthersHint')} onClick={signOutOthers} />
              <ListRow icon={<ShieldCheck />} title={t('profile.privacy')} subtitle={t('profile.privacyHint')} />
            </ListGroup>
          </section>

          <ListGroup>
            <ListRow icon={<LogOut />} tone="danger" title={t('profile.signOut')} chevron={false} onClick={() => void authRepository.signOut('local')} />
          </ListGroup>

          <p className="text-center text-xs text-text-3">ShiftCare {__APP_VERSION__}</p>
        </div>
      </div>

      {sheet === 'edit' && <EditProfileSheet user={user} open onClose={() => setSheet(null)} />}
      {sheet === 'languages' && <LanguagesSheet userId={user.id} current={spoken} open onClose={() => setSheet(null)} />}
      <ChangePasswordSheet email={user.email} open={sheet === 'password'} onClose={() => setSheet(null)} />
    </>
  )
}
