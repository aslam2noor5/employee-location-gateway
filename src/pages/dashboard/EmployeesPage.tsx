import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Search, Pencil, Trash2, Ban, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Card, CardBody, CardHeader, Badge, EmptyState, PageLoading } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Confirm, Toast } from '@/components/ui/Feedback'
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from '@/services/employee.service'
import { formatDateTime } from '@/utils/formatters'
import type { Employee } from '@/types'

interface EmployeeForm {
  name: string
  employee_number: string
  phone: string
  department: string
  status: 'active' | 'disabled'
}

const emptyForm: EmployeeForm = { name: '', employee_number: '', phone: '', department: '', status: 'active' }

export function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  const PAGE_SIZE = 50

  async function load() {
    setLoading(true)
    try {
      const { data, count } = await getEmployees({
        search: search || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setEmployees(data)
      setCount(count)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, page])

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

  function openEdit(emp: Employee) {
    setEditing(emp)
    setForm({
      name: emp.name,
      employee_number: emp.employee_number,
      phone: emp.phone ?? '',
      department: emp.department ?? '',
      status: emp.status,
    })
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.employee_number.trim()) {
      setFormError('الاسم والرقم الوظيفي مطلوبان.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateEmployee(editing.id, { ...form, phone: form.phone || null, department: form.department || null })
        notify('تم تحديث بيانات الموظف.')
      } else {
        await createEmployee({ ...form, phone: form.phone || null, department: form.department || null })
        notify('تمت إضافة الموظف بنجاح.')
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
      await deleteEmployee(deleting.id)
      notify('تم حذف الموظف.')
      setDeleting(null)
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  async function toggleStatus(emp: Employee) {
    const next = emp.status === 'active' ? 'disabled' : 'active'
    try {
      await updateEmployee(emp.id, { status: next })
      notify(next === 'active' ? 'تم تفعيل الموظف.' : 'تم تعطيل الموظف.')
      load()
    } catch (err) {
      notify((err as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">الموظفون</h1>
          <p className="mt-1 text-sm text-slate-500">{count} موظف</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          إضافة موظف
        </Button>
      </div>

      <Card>
        <CardHeader
          title="قائمة الموظفين"
          action={
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0) }}
                  placeholder="بحث بالاسم أو الرقم الوظيفي..."
                  className="pr-9"
                />
              </div>
              <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }} className="w-32">
                <option value="">الكل</option>
                <option value="active">نشط</option>
                <option value="disabled">معطل</option>
              </Select>
            </div>
          }
        />
        <CardBody className="px-0">
          {loading ? (
            <PageLoading />
          ) : employees.length === 0 ? (
            <EmptyState message="لا يوجد موظفون. ابدأ بإضافة موظف جديد." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-right text-xs text-slate-500">
                    <th className="px-5 py-3 font-medium">الاسم</th>
                    <th className="px-5 py-3 font-medium">الرقم الوظيفي</th>
                    <th className="px-5 py-3 font-medium">القسم</th>
                    <th className="px-5 py-3 font-medium">الهاتف</th>
                    <th className="px-5 py-3 font-medium">الحالة</th>
                    <th className="px-5 py-3 font-medium">تاريخ الإنشاء</th>
                    <th className="px-5 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-5 py-3 font-medium text-slate-800">{emp.name}</td>
                      <td className="px-5 py-3 text-slate-600">{emp.employee_number}</td>
                      <td className="px-5 py-3 text-slate-600">{emp.department ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-600" dir="ltr">{emp.phone ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge color={emp.status === 'active' ? 'green' : 'red'}>
                          {emp.status === 'active' ? 'نشط' : 'معطل'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDateTime(emp.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(emp)} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600" title="تعديل">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => toggleStatus(emp)} className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-50 hover:text-amber-600" title={emp.status === 'active' ? 'تعطيل' : 'تفعيل'}>
                            {emp.status === 'active' ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          </button>
                          <button onClick={() => setDeleting(emp)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="حذف">
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
                <button onClick={() => setPage((p) => p + 1)} disabled={page * PAGE_SIZE + PAGE_SIZE >= count} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40">التالي</button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'تعديل موظف' : 'إضافة موظف'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <Field label="الاسم" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="اسم الموظف" />
          </Field>
          <Field label="الرقم الوظيفي" required>
            <Input value={form.employee_number} onChange={(e) => setForm({ ...form, employee_number: e.target.value })} placeholder="مثال: 1203" dir="ltr" />
          </Field>
          <Field label="القسم">
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="مثال: تمريض" />
          </Field>
          <Field label="رقم الهاتف (اختياري)">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="01xxxxxxxxx" dir="ltr" />
          </Field>
          <Field label="الحالة">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'disabled' })}>
              <option value="active">نشط</option>
              <option value="disabled">معطل</option>
            </Select>
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
        title="حذف الموظف"
        message={`هل أنت متأكد من حذف "${deleting?.name}"؟ سيتم حذف كل روابطه وسجلاته.`}
        confirmLabel="حذف"
        danger
      />

      <Toast show={toastOpen} message={toastMsg} type={toastType} />
    </div>
  )
}