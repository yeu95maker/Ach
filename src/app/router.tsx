import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from './guards/RequireAuth'
import { RequirePermission } from './guards/RequirePermission'
import { AppShell } from './layout/AppShell'
import { NotFoundPage } from './StatusScreens'

// Route-level code splitting: each area is its own chunk.
const named = <T extends Record<string, React.ComponentType>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })))

const DashboardPage = named(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')
const SchedulePage = named(() => import('@/features/schedule/SchedulePage'), 'SchedulePage')
const NotificationsPage = named(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage')
const TeamPage = named(() => import('@/features/team/TeamPage'), 'TeamPage')
const ProfilePage = named(() => import('@/features/profile/ProfilePage'), 'ProfilePage')
const MyRequestsPage = named(() => import('@/features/leave/MyRequestsPage'), 'MyRequestsPage')
const LeaveRequestPage = named(() => import('@/features/leave/LeaveRequestPage'), 'LeaveRequestPage')
const SickLeavePage = named(() => import('@/features/sick-leave/SickLeavePage'), 'SickLeavePage')
const WishPlanPage = named(() => import('@/features/wishes/WishPlanPage'), 'WishPlanPage')
const WishManagementPage = named(() => import('@/features/wishes/WishManagementPage'), 'WishManagementPage')
const RosterEditorPage = named(() => import('@/features/roster-editor/RosterEditorPage'), 'RosterEditorPage')
const OpenShiftsPage = named(() => import('@/features/staffing/OpenShiftsPage'), 'OpenShiftsPage')
const HistoryPage = named(() => import('@/features/schedule/HistoryPage'), 'HistoryPage')
const NewsPage = named(() => import('@/features/news/NewsPage'), 'NewsPage')
const ForgotPasswordPage = named(() => import('@/features/auth/ForgotPasswordPage'), 'ForgotPasswordPage')
const ResetPasswordPage = named(() => import('@/features/auth/ResetPasswordPage'), 'ResetPasswordPage')

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'schedule', element: <SchedulePage /> },
          {
            path: 'schedule/plan',
            element: (
              <RequirePermission permission="schedule.manage">
                <RosterEditorPage />
              </RequirePermission>
            ),
          },
          {
            path: 'schedule/wishes',
            element: (
              <RequirePermission permission="wishes.submit">
                <WishPlanPage />
              </RequirePermission>
            ),
          },
          {
            path: 'schedule/wishes/manage',
            element: (
              <RequirePermission permission={['wishes.view', 'wishes.manage']}>
                <WishManagementPage />
              </RequirePermission>
            ),
          },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'news', element: <NewsPage /> },
          { path: 'schedule/open', element: <OpenShiftsPage /> },
          { path: 'schedule/history', element: <HistoryPage /> },
          { path: 'team', element: <TeamPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'requests', element: <MyRequestsPage /> },
          {
            path: 'requests/leave/new',
            element: (
              <RequirePermission permission="leave.request">
                <LeaveRequestPage />
              </RequirePermission>
            ),
          },
          {
            path: 'requests/sick/new',
            element: (
              <RequirePermission permission="sick_leave.report">
                <SickLeavePage />
              </RequirePermission>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' })
