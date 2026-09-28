import { useQuery, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Spinner } from './components/ui'
import { api, ApiError } from './lib/api'
import type { Me } from './lib/types'
import LoginPage from './pages/LoginPage'
import { householdQuery, UiProvider } from './state/ui'

const StartPage = lazy(() => import('./pages/StartPage'))
const MorePage = lazy(() => import('./pages/MorePage'))
const AccountsPage = lazy(() => import('./pages/AccountsPage'))
const MembersPage = lazy(() => import('./pages/MembersPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

export default function App() {
  const qc = useQueryClient()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/auth/me'),
    retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 2,
  })
  useEffect(() => {
    const onUnauthorized = () => qc.setQueryData(['me'], null)
    window.addEventListener('pampeliska:unauthorized', onUnauthorized)
    return () => window.removeEventListener('pampeliska:unauthorized', onUnauthorized)
  }, [qc])
  const household = useQuery({ ...householdQuery, enabled: !!me.data })

  if (me.isLoading || (me.data && household.isLoading)) return <Spinner center />
  if (!me.data) return <LoginPage />
  if (!household.data) return <Spinner center />

  return (
    <UiProvider me={me.data} household={household.data}>
      <Suspense fallback={<Spinner center />}>
        {household.data.settings.onboardingDone ? <MainRoutes /> : <StartPage />}
      </Suspense>
    </UiProvider>
  )
}

function MainRoutes() {
  const location = useLocation()
  useEffect(() => window.scrollTo(0, 0), [location.pathname])
  return (
    <AppShell>
      <Suspense fallback={<Spinner center />}>
        <Routes>
          <Route path="/" element={<Navigate to="/ucty" replace />} />
          <Route path="/ucty" element={<AccountsPage />} />
          <Route path="/ucty/:id" element={<AccountsPage />} />
          <Route path="/clenove" element={<MembersPage />} />
          <Route path="/nastaveni" element={<SettingsPage />} />
          <Route path="/vice" element={<MorePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  )
}
