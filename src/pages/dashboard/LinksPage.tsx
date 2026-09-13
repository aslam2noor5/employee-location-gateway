import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Copy, ExternalLink, Ban, QrCode, Check, Trash2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Card, CardBody, CardHeader, Badge, EmptyState, PageLoading, type BadgeColor } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Confirm, Toast } from '@/components/ui/Feedback'
import { getLinks, createLink, disableLink, enableLink, deleteLink, buildCheckUrl, getLinkRawToken } from '@/services/link.service'
import { getActiveEmployees } from '@/services/employee.service'
import { getWorkplaces } from '@/services/workplace.service'
import { isValidOriginalUrl } from '@/utils/validation'
import { formatDateTime, formatMeters, truncateUrl } from '@/utils/formatters'
import type { AttendanceLink, Employee, Workplace, LinkType } from '@/types'

function linkStatusColor(status: string): BadgeColor {
  switch (status) {
    case 'active': return 'green'
    case 'used': return 'purple'
    case 'expired': return 'red'
    case 'disabled': return 'slate'
    default: return 'slate'
  }
}

function linkStatusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'فعال',
    used: 'مستخدم',
    expired: 'منتهي',
    disabled: 'معطل',
  }
  return map[status] ?? status
}

interface CreateForm {
  employee_id: string
  workplace_id: string
  original_url: string
  link_type: LinkType
  duration: '1h' | '1d' | '3d' | '1w' | 'never'
  max_usage_count: string
}

const emptyForm: CreateForm = {
  employee_id: '',
  workplace_id: '',
  original_url: '',
  link_type: 'single_use',
  duration: '1d',
  max_usage_count: '',
}

const PAGE_SIZE = 50

export function LinksPage() {
  const [links, setLinks] = useState<AttendanceLink[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [workplaces, setWorkplaces] = useState<Workplace[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [qrState, setQrState] = useState<{ link: AttendanceLink; token: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [deleting, setDeleting] = useState<AttendanceLink | null>(null)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  async function load() {
    setLoading(true)
    try {
      const { data, count } = await getLinks({
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setLinks(data)
      setCount(count)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter, page])

  useEffect(() => {
    if (createOpen) {
      getActiveEmployees().then(setEmployees).catch(() => {})
      getWorkplaces().then(setWorkplaces).catch(() => {})
    }
  }, [createOpen])

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg)
    setToastType(type)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  async function copyLink(link: AttendanceLink) {
    try {
      const token = await getLinkRawToken(link.id)
      const url = buildCheckUrl(token)
      await navigator.clipboard.writeText(url)
      setCopied(link.id)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  async function openQr(link: AttendanceLink) {
    setQrLoading(true)
    try {
      const token = await getLinkRawToken(link.id)
      setQrState({ link, token })
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setQrLoading(false)
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!form.employee_id) { setFormError('اختر الموظف.'); return }
    if (!form.workplace_id) { setFormError('اختر مقر العمل.'); return }
    if (!isValidOriginalUrl(form.original_url.trim())) {
      setFormError('الرابط الأصلي يجب أن يكون HTTPS صالحًا.')
      return
    }
    setSaving(true)
    try {
      const res = await createLink({
        employee_id: form.employee_id,
        workplace_id: form.workplace_id,
        original_url: form.original_url.trim(),
        link_type: form.link_type,
        duration: form.duration,
        max_usage_count: form.max_usage_count ? Number(form.max_usage_count) : undefined,
      })
      notify('تم إنشاء الرابط بنجاح.')
      setCreatedUrl(buildCheckUrl(res.token))
      setCreateOpen(false)
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable(link: AttendanceLink) {
    try {
      if (link.status === 'disabled') {
        await enableLink(link.id)
        notify('تم تفعيل الرابط.')
      } else {
        await disableLink(link.id)
        notify('تم تعطيل الرابط.')
      }
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteLink(deleting.id)
      notify('تم حذف الرابط.')
      setDeleting(null)
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  function downloadQr() {
    if (!qrState) return
    const svg = document.getElementById('qr-display')
    if (!svg) return
    const xml = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([`<?xml version="1.0"?>${xml}`], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `elg-qr-${qrState.link.id}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const durationLabel: Record<CreateForm['duration'], string> = {
    '1h': 'ساعة',
    '1d': 'يوم',
    '3d': '3 أيام',
    '1w': 'أسبوع',
    never: 'بدون انتهاء',
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الروابط</h1>
          <p className="mt-1 text-sm text-slate-500">{count} رابط</p>
        </div>
        <Button onClick={() => { setCreatedUrl(null); setForm(emptyForm); setFormError(null); setCreateOpen(true) }}>
          <Plus className="h-4 w-4" />
          إنشاء رابط جديد
        </Button>
      </div>

      <Card>
        <CardHeader
          title="قائمة الروابط"
          action={
            <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }} className="w-36">
              <option value="">الكل</option>
              <option value="active">فعال</option>
              <option value="used">مستخدم</option>
              <option value="expired">منتهي</option>
              <option value="disabled">معطل</option>
            </Select>
          }
        />
        <CardBody className="px-0">
          {loading ? (
            <PageLoading />
          ) : links.length === 0 ? (
            <EmptyState message="لا توجد روابط. أنشئ أول رابط للموظف." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-right text-xs text-slate-500">
                    <th className="px-5 py-3 font-medium">الموظف</th>
                    <th className="px-5 py-3 font-medium">الرابط الأصلي</th>
                    <th className="px-5 py-3 font-medium">الرابط الوسيط</th>
                    <th className="px-5 py-3 font-medium">مقر العمل</th>
                    <th className="px-5 py-3 font-medium">الإنشاء</th>
                    <th className="px-5 py-3 font-medium">النهاية</th>
                    <th className="px-5 py-3 font-medium">الاستخدامات</th>
                    <th className="px-5 py-3 font-medium">النوع</th>
                    <th className="px-5 py-3 font-medium">الحالة</th>
                    <th className="px-5 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{link.employee?.name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{link.employee?.employee_number ?? ''}</p>
                      </td>
                      <td className="px-5 py-3">
                        <a href={link.original_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline" dir="ltr" title={link.original_url}>
                          {truncateUrl(link.original_url)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => copyLink(link)}
                          className="flex items-center gap-1 font-mono text-xs text-slate-600 hover:text-emerald-600"
                          title="نسخ الرابط الوسيط"
                        >
                          /check/••••••••••••
                          {copied === link.id ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{link.workplace?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDateTime(link.created_at)}</td>
                      <td className="px-5 py-3 text-slate-500">{link.expires_at ? formatDateTime(link.expires_at) : 'بدون انتهاء'}</td>
                      <td className="px-5 py-3 text-slate-600">{link.usage_count}</td>
                      <td className="px-5 py-3 text-slate-600">{link.link_type === 'single_use' ? 'استخدام واحد' : 'متعدد'}</td>
                      <td className="px-5 py-3">
                        <Badge color={linkStatusColor(link.status)}>{linkStatusLabel(link.status)}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openQr(link)} disabled={qrLoading} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600" title="QR Code">
                            <QrCode className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDisable(link)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600" title={link.status === 'disabled' ? 'تفعيل' : 'تعطيل'}>
                            <Ban className="h-4 w-4" />
                          </button>
                          <button onClick={() => setDeleting(link)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="حذف">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
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

      {/* Create link modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="إنشاء رابط جديد" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <Field label="الموظف" required>
            <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
              <option value="">اختر الموظف...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_number})</option>)}
            </Select>
          </Field>
          <Field label="مقر العمل" required>
            <Select value={form.workplace_id} onChange={(e) => setForm({ ...form, workplace_id: e.target.value })}>
              <option value="">اختر المقر...</option>
              {workplaces.map((wp) => <option key={wp.id} value={wp.id}>{wp.name} — نطاق {formatMeters(wp.allowed_radius)}</option>)}
            </Select>
          </Field>
          <Field label="الرابط الأصلي" required>
            <Input
              value={form.original_url}
              onChange={(e) => setForm({ ...form, original_url: e.target.value })}
              placeholder="https://drive.google.com/... أو أي رابط HTTPS"
              dir="ltr"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="نوع الاستخدام">
              <Select value={form.link_type} onChange={(e) => setForm({ ...form, link_type: e.target.value as LinkType })}>
                <option value="single_use">استخدام واحد</option>
                <option value="multi_use">متعدد</option>
              </Select>
            </Field>
            <Field label="مدة الصلاحية">
              <Select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value as CreateForm['duration'] })}>
                <option value="1h">ساعة</option>
                <option value="1d">يوم</option>
                <option value="3d">3 أيام</option>
                <option value="1w">أسبوع</option>
                <option value="never">بدون انتهاء</option>
              </Select>
            </Field>
            <Field label="حد الاستخدام (اختياري)">
              <Input
                type="number"
                min={1}
                value={form.max_usage_count}
                onChange={(e) => setForm({ ...form, max_usage_count: e.target.value })}
                placeholder="غير محدد"
                dir="ltr"
              />
            </Field>
          </div>
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            مدة الصلاحية: {durationLabel[form.duration]} • نوع الاستخدام: {form.link_type === 'single_use' ? 'استخدام واحد' : 'متعدد'}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>إلغاء</Button>
            <Button type="submit" disabled={saving}>{saving ? 'جاري الإنشاء...' : 'إنشاء الرابط'}</Button>
          </div>
        </form>
      </Modal>

      {/* Created token modal */}
      <Modal open={Boolean(createdUrl)} onClose={() => setCreatedUrl(null)} title="تم إنشاء الرابط">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">أرسل هذا الرابط الوسيط للموظف:</p>
          <div className="rounded-lg bg-slate-50 px-4 py-3" dir="ltr">
            <a href={createdUrl ?? ''} className="break-all font-mono text-sm text-emerald-600 hover:underline" target="_blank" rel="noreferrer">
              {createdUrl}
            </a>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setCreatedUrl(null)}>إغلاق</Button>
            <Button onClick={async () => {
              if (!createdUrl) return
              await navigator.clipboard.writeText(createdUrl)
              notify('تم نسخ الرابط.')
              setCreatedUrl(null)
            }}>
              <Copy className="h-4 w-4" />
              نسخ الرابط
            </Button>
          </div>
        </div>
      </Modal>

      {/* QR Modal */}
      <Modal open={Boolean(qrState)} onClose={() => setQrState(null)} title="رمز QR للرابط الوسيط" size="sm">
        {qrState && (
          <div className="flex flex-col items-center space-y-4">
            <QRCodeSVG
              id="qr-display"
              value={buildCheckUrl(qrState.token)}
              size={220}
              level="M"
              includeMargin
            />
            <p className="break-all text-center text-xs text-slate-500" dir="ltr">
              {buildCheckUrl(qrState.token)}
            </p>
            <p className="text-center text-xs text-slate-400">الموظف: {qrState.link.employee?.name}</p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => setQrState(null)}>إغلاق</Button>
              <Button onClick={downloadQr}>
                <QrCode className="h-4 w-4" />
                تحميل QR
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف الرابط"
        message="هل أنت متأكد من حذف هذا الرابط؟ سيتم حذف السجلات المرتبطة به."
        confirmLabel="حذف"
        danger
      />

      <Toast show={toastOpen} message={toastMsg} type={toastType} />
    </div>
  )
}