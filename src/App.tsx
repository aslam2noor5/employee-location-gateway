import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { PageLoading } from '@/components/ui/Card'

const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const CheckPage = lazy(() =>
  import('@/pages/check/CheckPage').then((m) => ({ default: m.CheckPage })),
)
const HomePage = lazy(() =>
  import('@/pages/dashboard/HomePage').then((m) => ({ default: m.HomePage })),
)
const EmployeesPage = lazy(() =>
  import('@/pages/dashboard/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
)
const WorkplacesPage = lazy(() =>
  import('@/pages/dashboard/WorkplacesPage').then((m) => ({ default: m.WorkplacesPage })),
)
const LinksPage = lazy(() =>
  import('@/pages/dashboard/LinksPage').then((m) => ({ default: m.LinksPage })),
)
const AttendancePage = lazy(() =>
  import('@/pages/dashboard/AttendancePage').then((m) => ({ default: m.AttendancePage })),
)
const MapPage = lazy(() =>
  import('@/pages/dashboard/MapPage').then((m) => ({ default: m.MapPage })),
)
const SettingsPage = lazy(() =>
  import('@/pages/dashboard/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

function withSuspense(el: React.ReactNode) {
  return <Suspense fallback={<PageLoading />}>{el}</Suspense>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public — employee check-in */}
        <Route path="/check/:token" element={withSuspense(<CheckPage />)} />

        {/* Auth */}
        <Route path="/login" element={withSuspense(<LoginPage />)} />

        {/* Dashboard */}
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={withSuspense(<HomePage />)} />
          <Route path="employees" element={withSuspense(<EmployeesPage />)} />
          <Route path="workplaces" element={withSuspense(<WorkplacesPage />)} />
          <Route path="links" element={withSuspense(<LinksPage />)} />
          <Route path="attendance" element={withSuspense(<AttendancePage />)} />
          <Route path="map" element={withSuspense(<MapPage />)} />
          <Route path="settings" element={withSuspense(<SettingsPage />)} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}