import { useEffect, useState } from 'react'
import { Download, Eye, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Card, CardBody, CardHeader, Badge, EmptyState, PageLoading, type BadgeColor } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Toast } from '@/components/ui/Feedback'
import {
  getRecords,
  getRecord,
  exportCsv,
  attendanceStatusLabel,
} from '@/services/attendance.service'
import { getEmployees } from '@/services/employee.service'
import { getWorkplaces } from '@/services/workplace.service'
import { formatDateTime, formatMeters, verificationLevelText } from '@/utils/formatters'
import type { AttendanceRecord, Employee, Workplace } from '@/types'

function statusColor(status: string): BadgeColor {
  switch (status) {
    case 'inside': return 'green'
    case 'outside': return 'red'
    case 'low_accuracy': return 'amber'
    case 'location_denied': return 'amber'
    case 'already_used': return 'purple'
    case 'expired_link': return 'slate'
    case 'invalid_link': return 'slate'
    case 'disabled_link': return 'slate'
    default: return 'slate'
  }
}

const PAGE_SIZE = 50

export function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [workplaces, setWorkplaces] = useState<Workplace[]>([])
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [workplaceFilter, setWorkplaceFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<AttendanceRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [searchTerm, setSearchTerm] = useState('')

  async function load() {
    setLoading(true)
    try {
      const { data, count } = await getRecords({
        employee_id: employeeFilter || undefined,
        workplace_id: workplaceFilter || undefined,
        status: statusFilter || undefined,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(new Date(toDate).getTime() + 86399999).toISOString() : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      let filtered = data
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase()
        filtered = filtered.filter((r) =>
          r.employee?.name?.toLowerCase().includes(q) ||
          r.employee?.employee_number?.toLowerCase().includes(q))
      }
      setRecords(filtered)
      setCount(count)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getEmployees({ limit: 1000 }).then((r) => setEmployees(r.data)).catch(() => {})
    getWorkplaces().then(setWorkplaces).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeFilter, workplaceFilter, statusFilter, fromDate, toDate, page, searchTerm])

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg)
    setToastType(type)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  async function openDetail(id: string) {
    setDetailLoading(true)
    try {
      const rec = await getRecord(id)
      setDetail(rec)
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const blob = await exportCsv({
        employee_id: employeeFilter || undefined,
        workplace_id: workplaceFilter || undefined,
        status: statusFilter || undefined,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(new Date(toDate).getTime() + 86399999).toISOString() : undefined,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      notify('تم تصدير البيانات.')
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">سجلات الحضور</h1>
          <p className="mt-1 text-sm text-slate-500">{count} سجل</p>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={exporting}>
          <Download className="h-4 w-4" />
          {exporting ? 'جاري التصدير...' : 'تصدير CSV'}
        </Button>
      </div>

      <Card>
        <CardHeader title="الفلاتر" />
        <CardBody>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }} placeholder="بحث..." className="pr-9" />
            </div>
            <Select value={employeeFilter} onChange={(e) => { setEmployeeFilter(e.target.value); setPage(0) }}>
              <option value="">كل الموظفين</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </Select>
            <Select value={workplaceFilter} onChange={(e) => { setWorkplaceFilter(e.target.value); setPage(0) }}>
              <option value="">كل المقرات</option>
              {workplaces.map((wp) => <option key={wp.id} value={wp.id}>{wp.name}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}>
              <option value="">كل الحالات</option>
              <option value="inside">داخل المقر</option>
              <option value="outside">خارج المقر</option>
              <option value="low_accuracy">دقة منخفضة</option>
              <option value="location_denied">رفض الموقع</option>
              <option value="expired_link">رابط منتهي</option>
              <option value="invalid_link">رابط غير صالح</option>
              <option value="already_used">تم استخدامه</option>
            </Select>
            <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(0) }} />
            <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(0) }} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="السجلات" />
        <CardBody className="px-0">
          {loading ? (
            <PageLoading />
          ) : records.length === 0 ? (
            <EmptyState message="لا توجد سجلات مطابقة." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-right text-xs text-slate-500">
                    <th className="px-5 py-3 font-medium">الموظف</th>
                    <th className="px-5 py-3 font-medium">الرقم الوظيفي</th>
                    <th className="px-5 py-3 font-medium">وقت التسجيل</th>
                    <th className="px-5 py-3 font-medium">المسافة</th>
                    <th className="px-5 py-3 font-medium">دقة GPS</th>
                    <th className="px-5 py-3 font-medium">الحالة</th>
                    <th className="px-5 py-3 font-medium">مستوى التحقق</th>
                    <th className="px-5 py-3 font-medium">المقر</th>
                    <th className="px-5 py-3 font-medium">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => (
                    <tr key={rec.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-medium text-slate-800">{rec.employee?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{rec.employee?.employee_number ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{formatDateTime(rec.server_timestamp)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatMeters(rec.distance_meters)}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {rec.accuracy !== null ? `${Math.round(rec.accuracy)} متر` : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge color={statusColor(rec.attendance_status)}>{attendanceStatusLabel(rec.attendance_status)}</Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{verificationLevelText(rec.verification_level)}</td>
                      <td className="px-5 py-3 text-slate-600">{rec.workplace?.name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => openDetail(rec.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="التفاصيل">
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {count > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3">
              <p className="text-sm text-slate-500">عرض {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, count)} من {count}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40">السابق</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= count} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40">التالي</button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Detail modal */}
      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="تفاصيل التسجيل" size="lg">
        {detailLoading && <div className="py-8 text-center text-sm text-slate-500">جاري التحميل...</div>}
        {detail && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">بيانات الموظف</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">الاسم</dt><dd className="font-medium">{detail.employee?.name ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">الرقم الوظيفي</dt><dd>{detail.employee?.employee_number ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">القسم</dt><dd>{detail.employee?.department ?? '—'}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">بيانات الرابط</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">النوع</dt><dd>{detail.link?.link_type === 'single_use' ? 'استخدام واحد' : 'متعدد'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">الرابط الأصلي</dt></div>
                  <div className="break-all text-xs text-emerald-600" dir="ltr">{detail.link?.original_url ?? '—'}</div>
                </dl>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">التوقيت</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">وقت السيرفر (الرسمي)</dt><dd>{formatDateTime(detail.server_timestamp)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">وقت العميل</dt><dd>{detail.client_timestamp ? formatDateTime(detail.client_timestamp) : '—'}</dd></div>
                </dl>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">الموقع والدقة</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Latitude</dt><dd className="font-mono" dir="ltr">{detail.latitude ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Longitude</dt><dd className="font-mono" dir="ltr">{detail.longitude ?? '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Accuracy</dt><dd>{detail.accuracy !== null ? `${Math.round(detail.accuracy)} متر` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">المسافة</dt><dd>{formatMeters(detail.distance_meters)}</dd></div>
                </dl>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">النتيجة</h4>
                <div className="space-y-2">
                  <Badge color={statusColor(detail.attendance_status)}>{attendanceStatusLabel(detail.attendance_status)}</Badge>
                  <p className="text-sm">مستوى التحقق: <strong>{verificationLevelText(detail.verification_level)}</strong></p>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-slate-700">معلومات الطلب</h4>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">IP</dt><dd className="font-mono" dir="ltr">{detail.ip_address ?? '—'}</dd></div>
                  <div className="pt-1"><dt className="text-slate-500">User Agent</dt><dd className="mt-1 break-all text-xs">{detail.user_agent ?? '—'}</dd></div>
                </dl>
              </div>
            </div>

            {detail.risk_flags && detail.risk_flags.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h4 className="mb-2 text-sm font-semibold text-amber-700">مؤشرات المراجعة</h4>
                <ul className="space-y-1 text-xs text-amber-700">
                  {detail.risk_flags.map((flag) => <li key={flag} dir="ltr">{flag}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Toast show={toastOpen} message={toastMsg} type={toastType} />
    </div>
  )
}