import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  Home,
  Users,
  Link2,
  ClipboardCheck,
  Map as MapIcon,
  Building2,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { signOut } from '@/lib/supabase/auth'
import { PageLoading, Badge } from '@/components/ui/Card'

const navItems = [
  { to: '/', label: 'الرئيسية', icon: Home },
  { to: '/employees', label: 'الموظفون', icon: Users },
  { to: '/links', label: 'الروابط', icon: Link2 },
  { to: '/attendance', label: 'سجلات الحضور', icon: ClipboardCheck },
  { to: '/map', label: 'الخريطة', icon: MapIcon },
  { to: '/workplaces', label: 'مقر العمل', icon: Building2 },
  { to: '/settings', label: 'إعدادات الحساب', icon: SettingsIcon },
]

export function DashboardLayout() {
  const { user, loading, isAdminUser } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) {
    return <PageLoading />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isAdminUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">غير مصرح بالدخول</h1>
          <p className="mt-1 text-sm text-slate-500">هذا الحساب ليس له صلاحية الوصول إلى لوحة التحكم.</p>
          <button
            onClick={async () => { await signOut(); navigate('/login') }}
            className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    )
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900">Employee Location Gateway</h1>
          <p className="text-xs text-slate-400">لوحة تحكم المشرف</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 px-4 py-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            {user.email?.charAt(0).toUpperCase() ?? 'أ'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{user.email}</p>
            <Badge color="green">Admin</Badge>
          </div>
        </div>
        <button
          onClick={async () => { await signOut(); navigate('/login') }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 border-l border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-72 bg-white shadow-xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute left-3 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-900">Employee Location Gateway</span>
        </div>
      </header>

      {/* Main content */}
      <main className="lg:mr-64">
        <div className="mx-auto max-w-7xl p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}