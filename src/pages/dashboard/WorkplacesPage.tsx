import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, MapPin, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Card, CardBody, CardHeader, Badge, EmptyState, PageLoading } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Confirm, Toast } from '@/components/ui/Feedback'
import { getWorkplaces, createWorkplace, updateWorkplace, deleteWorkplace } from '@/services/workplace.service'
import { WorkplaceMap } from '@/components/maps/WorkplaceMap'
import { isValidLatitude, isValidLongitude, isValidRadius } from '@/utils/validation'
import { formatDateTime } from '@/utils/formatters'
import type { Workplace } from '@/types'

interface WorkplaceForm {
  name: string
  latitude: string
  longitude: string
  allowed_radius: string
  min_accuracy: string
  status: 'active' | 'disabled'
}

const emptyForm: WorkplaceForm = {
  name: '',
  latitude: '',
  longitude: '',
  allowed_radius: '100',
  min_accuracy: '100',
  status: 'active',
}

export function WorkplacesPage() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Workplace | null>(null)
  const [form, setForm] = useState<WorkplaceForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [deleting, setDeleting] = useState<Workplace | null>(null)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  async function load() {
    setLoading(true)
    try {
      setWorkplaces(await getWorkplaces())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg)
    setToastType(type)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(wp: Workplace) {
    setEditing(wp)
    setForm({
      name: wp.name,
      latitude: String(wp.latitude),
      longitude: String(wp.longitude),
      allowed_radius: String(wp.allowed_radius),
      min_accuracy: String(wp.min_accuracy),
      status: wp.status,
    })
    setFormError(null)
    setModalOpen(true)
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setFormError('المتصفح لا يدعم تحديد الموقع.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }))
        setLocating(false)
      },
      () => {
        setFormError('تعذر تحديد موقعك الحالي.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    const radius = Number(form.allowed_radius)
    const minAcc = Number(form.min_accuracy)

    if (!form.name.trim()) { setFormError('اسم المقر مطلوب.'); return }
    if (!isValidLatitude(lat) || !isValidLongitude(lng)) { setFormError('إحداثيات غير صالحة.'); return }
    if (!isValidRadius(radius)) { setFormError('نطاق السماح غير صالح (يجب أن يكون بين 1 و 50000 متر).'); return }
    if (!(minAcc > 0)) { setFormError('الحد الأدنى للدقة غير صالح.'); return }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        latitude: lat,
        longitude: lng,
        allowed_radius: radius,
        min_accuracy: minAcc,
        status: form.status,
      }
      if (editing) {
        await updateWorkplace(editing.id, payload)
        notify('تم تحديث بيانات المقر.')
      } else {
        await createWorkplace(payload)
        notify('تم إضافة المقر بنجاح.')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteWorkplace(deleting.id)
      notify('تم حذف المقر.')
      setDeleting(null)
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">مقر العمل</h1>
          <p className="mt-1 text-sm text-slate-500">أضف المقرات وحدد نطاق السماح حول كل مقر</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          إضافة مقر
        </Button>
      </div>

      {loading ? (
        <PageLoading />
      ) : workplaces.length === 0 ? (
        <Card><CardBody><EmptyState message="لا توجد مقرات بعد. أضف أول مقر عمل." /></CardBody></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {workplaces.map((wp) => (
            <Card key={wp.id}>
              <CardHeader
                title={wp.name}
                subtitle={`نطاق السماح: ${wp.allowed_radius} متر • دقة أدنى: ${wp.min_accuracy} متر`}
                action={
                  <Badge color={wp.status === 'active' ? 'green' : 'red'}>
                    {wp.status === 'active' ? 'نشط' : 'معطل'}
                  </Badge>
                }
              />
              <CardBody className="space-y-3">
                <WorkplaceMap workplace={wp} className="h-56" />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Latitude</p>
                    <p className="font-mono text-slate-700" dir="ltr">{wp.latitude.toFixed(6)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Longitude</p>
                    <p className="font-mono text-slate-700" dir="ltr">{wp.longitude.toFixed(6)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">أنشئ في</p>
                    <p className="text-slate-700">{formatDateTime(wp.created_at)}</p>
                  </div>
                </div>
                <div className="flex justify-end gap-1 border-t border-slate-100 pt-3">
                  <button onClick={() => openEdit(wp)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="تعديل">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(wp)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="حذف">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل مقر' : 'إضافة مقر'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <Field label="اسم المقر" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: نقابة التمريض" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" required>
              <Input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="29.xxxxxx" dir="ltr" />
            </Field>
            <Field label="Longitude" required>
              <Input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="31.xxxxxx" dir="ltr" />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={useCurrentLocation} disabled={locating}>
              {locating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {locating ? 'جاري تحديد الموقع...' : 'تحديد موقعي الحالي'}
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نطاق السماح (متر)" required>
              <Input type="number" min={1} value={form.allowed_radius} onChange={(e) => setForm({ ...form, allowed_radius: e.target.value })} dir="ltr" />
            </Field>
            <Field label="الحد الأدنى لدقة GPS (متر)" required>
              <Input type="number" min={1} value={form.min_accuracy} onChange={(e) => setForm({ ...form, min_accuracy: e.target.value })} dir="ltr" />
            </Field>
          </div>

          <Field label="الحالة">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'disabled' })}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="active">نشط</option>
              <option value="disabled">معطل</option>
            </select>
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>إلغاء</Button>
            <Button type="submit" disabled={saving}>{saving ? 'حفظ...' : 'حفظ'}</Button>
          </div>
        </form>
      </Modal>

      <Confirm
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف المقر"
        message={`هل أنت متأكد من حذف "${deleting?.name}"؟`}
        confirmLabel="حذف"
        danger
      />

      <Toast show={toastOpen} message={toastMsg} type={toastType} />
    </div>
  )
}