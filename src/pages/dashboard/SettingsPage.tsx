import { useEffect, useState, type FormEvent } from 'react'
import { Save, KeyRound, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, PageLoading } from '@/components/ui/Card'
import { Toast } from '@/components/ui/Feedback'
import { useAuth } from '@/hooks/useAuth'
import { getSettings, updateSettings } from '@/services/settings.service'
import type { AppSettings } from '@/types'

export function SettingsPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .finally(() => setLoading(false))
  }, [])

  function notify(msg: string, type: 'success' | 'error' = 'success') {
    setToastMsg(msg)
    setToastType(type)
    setToastOpen(true)
    setTimeout(() => setToastOpen(false), 3000)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!settings) return
    if (!(settings.global_min_accuracy > 0)) {
      notify('الحد الأدنى للدقة يجب أن يكون أكبر من صفر.', 'error')
      return
    }
    setSaving(true)
    try {
      await updateSettings(settings)
      notify('تم حفظ الإعدادات.')
    } catch (err) {
      notify((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <PageLoading />

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">إعدادات الحساب</h1>

      <Card>
        <CardHeader title="بيانات الحساب" />
        <CardBody>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium text-slate-800" dir="ltr">{user?.email ?? '—'}</p>
              <p className="text-sm text-slate-500">دور: مدير (Admin)</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
            <KeyRound className="ml-2 inline h-4 w-4" />
            كلمة المرور تُدار من خلال صفحة الأمان في Supabase Auth.
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="إعدادات النظام" subtitle="تؤثر على سلوك تسجيل الحضور" />
        <CardBody>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div>
                <p className="font-medium text-slate-800">السماح بالانتقال للرابط الأصلي إذا كان خارج النطاق</p>
                <p className="mt-1 text-sm text-slate-500">
                  إذا كانت YES، سيتم تحويل الموظف للرابط الأصلي حتى لو كان خارج نطاق المقر. الافتراضي NO.
                </p>
              </div>
              <button
                type="button"
                onClick={() => settings && setSettings({ ...settings, allow_outside_redirect: !settings.allow_outside_redirect })}
                className={`relative h-7 w-14 shrink-0 rounded-full transition-colors ${
                  settings?.allow_outside_redirect ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    settings?.allow_outside_redirect ? 'right-8' : 'right-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div>
                <p className="font-medium text-slate-800">الحد الأدنى المقبول لدقة GPS</p>
                <p className="mt-1 text-sm text-slate-500">
                  إذا كانت دقة الموقع أكبر من هذه القيمة تُسجل الحالة "دقة منخفضة" ولا يُعتبر الموقع موثوقًا.
                </p>
              </div>
              <input
                type="number"
                min={1}
                value={settings?.global_min_accuracy ?? 100}
                onChange={(e) => settings && setSettings({ ...settings, global_min_accuracy: Number(e.target.value) })}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                dir="ltr"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? 'حفظ...' : 'حفظ الإعدادات'}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Toast show={toastOpen} message={toastMsg} type={toastType} />
    </div>
  )
}