import { useEffect, useState } from 'react'
import { Users, CalendarCheck, MapPin, MapPinOff, AlertTriangle, Link2, Clock } from 'lucide-react'
import { getDashboardStats, getTodayHourlyData } from '@/services/attendance.service'
import { StatCard } from '@/components/dashboard/StatCard'
import { Card, CardHeader, CardBody, PageLoading, Badge, type BadgeColor } from '@/components/ui/Card'
import type { DashboardStats, AttendanceStatus } from '@/types'
import { formatTime, formatMeters, attendanceStatusText } from '@/utils/formatters'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

function statusColor(status: AttendanceStatus): BadgeColor {
  switch (status) {
    case 'inside': return 'green'
    case 'outside': return 'red'
    case 'low_accuracy': return 'amber'
    case 'location_denied': return 'amber'
    case 'already_used': return 'purple'
    default: return 'slate'
  }
}

export function HomePage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [hourlyData, setHourlyData] = useState<{ hour: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getDashboardStats(), getTodayHourlyData()])
      .then(([s, h]) => { setStats(s); setHourlyData(h) })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageLoading />
  if (error) return <div className="text-red-600">حدث خطأ: {error}</div>
  if (!stats) return <PageLoading />

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">لوحة التحكم</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="إجمالي الموظفين" value={stats.totalEmployees} icon={Users} color="bg-blue-600" />
        <StatCard title="تسجيلات اليوم" value={stats.todayCheckins} icon={CalendarCheck} color="bg-emerald-600" />
        <StatCard title="روابط فعالة" value={stats.activeLinks} icon={Link2} color="bg-teal-600" />
        <StatCard title="روابط منتهية/مستخدمة" value={stats.expiredLinks} icon={Clock} color="bg-slate-600" />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard title="داخل نطاق المقر" value={stats.insideCount} icon={MapPin} color="bg-green-600" subtitle="اليوم" />
        <StatCard title="خارج نطاق المقر" value={stats.outsideCount} icon={MapPinOff} color="bg-red-600" subtitle="اليوم" />
        <StatCard title="دقة GPS ضعيفة" value={stats.lowAccuracyCount} icon={AlertTriangle} color="bg-amber-500" subtitle="اليوم" />
      </div>

      <Card>
        <CardHeader title="تسجيلات حسب الساعة" subtitle="الرسم البياني للتسجيلات (اليوم)" />
        <CardBody>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="عدد التسجيلات" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="آخر عمليات التسجيل" />
        <CardBody className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-right text-xs text-slate-500">
                  <th className="px-5 py-3 font-medium">الموظف</th>
                  <th className="px-5 py-3 font-medium">الوقت</th>
                  <th className="px-5 py-3 font-medium">المسافة</th>
                  <th className="px-5 py-3 font-medium">الدقة</th>
                  <th className="px-5 py-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentRecords.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-slate-400" colSpan={5}>
                      لا توجد تسجيلات بعد
                    </td>
                  </tr>
                ) : (
                  stats.recentRecords.map((rec) => (
                    <tr key={rec.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{rec.employee?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{rec.employee?.employee_number ?? ''}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatTime(rec.created_at)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatMeters(rec.distance_meters)}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {rec.accuracy !== null ? `${Math.round(rec.accuracy)} متر` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge color={statusColor(rec.attendance_status)}>
                          {attendanceStatusText(rec.attendance_status)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}