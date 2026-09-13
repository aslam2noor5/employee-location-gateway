import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldCheck, MapPin, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import {
  validateToken,
  submitAttendance,
  getCurrentPosition,
} from '@/services/validation.service'
import type { LinkValidationResult, GeoResult } from '@/services/validation.service'

type Phase =
  | 'validating'
  | 'invalid-setup'
  | 'requesting_location'
  | 'location_obtained'
  | 'submitting'
  | 'success'
  | 'failed'

const GEO_ERROR_MESSAGES: Record<string, string> = {
  permission_denied: 'لا يمكن إتمام التسجيل بدون السماح بالوصول إلى الموقع.',
  unavailable: 'تعذر تحديد موقعك.',
  timeout: 'تعذر تحديد موقعك خلال المدة المسموحة.',
  unsupported: 'المتصفح لا يدعم تحديد الموقع.',
  error: 'حدث خطأ أثناء تحديد موقعك.',
}

export function CheckPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [phase, setPhase] = useState<Phase>('validating')
  const [linkInfo, setLinkInfo] = useState<LinkValidationResult | null>(null)
  const [geo, setGeo] = useState<GeoResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)
  const [validated, setValidated] = useState(false)
  const startedRef = useRef(false)

  const runFlow = useCallback(async () => {
    setErrorMessage('')

    // 1) Validate token
    const result = await validateToken(token)
    if (!result.valid) {
      setLinkInfo(result)
      setPhase('failed')
      setErrorMessage(result.message ?? 'هذا الرابط غير صالح أو انتهت صلاحيته.')
      return
    }
    setLinkInfo(result)
    setValidated(true)
    setPhase('requesting_location')

    // 2) Get location
    let position: GeoResult
    try {
      position = await getCurrentPosition()
    } catch (err) {
      setPhase('failed')
      setErrorMessage(GEO_ERROR_MESSAGES[(err as Error).message] ?? 'تعذر تحديد موقعك.')
      return
    }
    setGeo(position)
    setPhase('location_obtained')

    // 3) Submit to server
    setPhase('submitting')
    const response = await submitAttendance({
      token,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      client_timestamp: new Date(position.timestamp).toISOString(),
    })

    if (response.success && response.original_url) {
      setRedirectUrl(response.original_url)
      setPhase('success')
      // 4) Redirect to the ORIGINAL url from the DB
      setTimeout(() => {
        window.location.href = response.original_url as string
      }, 1200)
    } else {
      setPhase('failed')
      setErrorMessage(response.message ?? 'حدث خطأ أثناء تسجيل البيانات.')
    }
  }, [token])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    runFlow().catch(() => {
      setPhase('failed')
      setErrorMessage('حدث خطأ أثناء تسجيل البيانات.')
    })
  }, [runFlow])

  function retryGeolocation() {
    startedRef.current = false
    void runFlow()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        {/* Logo */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
          <ShieldCheck className="h-9 w-9" />
        </div>

        <h1 className="mt-4 text-xl font-bold text-slate-900">تسجيل البيانات</h1>

        {validated && linkInfo?.employee_name && phase !== 'validating' && phase !== 'failed' && (
          <p className="mt-2 text-sm text-slate-500">الموظف: <strong className="text-slate-700">{linkInfo.employee_name}</strong></p>
        )}

        <div className="mt-8 min-h-[160px]">
          {/* Phase content */}
          {phase === 'validating' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm text-slate-600">جارٍ التحقق من الرابط...</p>
            </div>
          )}

          {phase === 'requesting_location' && (
            <div className="flex flex-col items-center gap-3">
              <MapPin className="h-8 w-8 animate-pulse text-emerald-600" />
              <p className="text-sm text-slate-600">جاري تحديد موقعك...</p>
              <p className="text-xs text-slate-400">يرجى السماح بالوصول إلى الموقع</p>
            </div>
          )}

          {phase === 'location_obtained' && geo && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <p className="text-sm font-medium text-slate-700">تم تحديد موقعك بنجاح</p>
              <p className="text-xs text-slate-500">دقة الموقع: <strong className="text-slate-700">{Math.round(geo.accuracy)} متر</strong></p>
            </div>
          )}

          {phase === 'submitting' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
              <p className="text-sm text-slate-600">جاري تسجيل البيانات...</p>
            </div>
          )}

          {phase === 'success' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-base font-semibold text-slate-800">تم التسجيل بنجاح</p>
              <p className="text-sm text-slate-500">جاري فتح الرابط...</p>
              {redirectUrl && (
                <p className="mt-1 text-xs text-emerald-600" dir="ltr">{redirectUrl}</p>
              )}
            </div>
          )}

          {phase === 'failed' && (
            <div className="flex flex-col items-center gap-3">
              <XCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm font-medium text-slate-700">{errorMessage}</p>
              {geo?.accuracy && linkInfo?.valid && (errorMessage.includes('منخفضة') || errorMessage.includes('خارج نطاق') || errorMessage.includes('تعذر')) && (
                <button
                  onClick={retryGeolocation}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  إعادة تحديد الموقع
                </button>
              )}
              {(linkInfo?.valid === false || (geo?.accuracy === undefined && !linkInfo?.valid)) && (
                <p className="text-xs text-slate-400">لا يمكن المتابعة لأن الرابط غير صالح.</p>
              )}
            </div>
          )}
        </div>

        {phase === 'location_obtained' && geo && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            <MapPin className="h-4 w-4 text-emerald-600" />
            <span dir="ltr">{geo.latitude.toFixed(6)}, {geo.longitude.toFixed(6)}</span>
          </div>
        )}

        <p className="border-t border-slate-100 pt-4 text-xs text-slate-400">
          يتم تسجيل موقعك والتحقق منه قبل فتح الرابط المطلوب.
        </p>
      </div>
    </div>
  )
}