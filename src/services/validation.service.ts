import { supabase } from '@/lib/supabase/client'
import type { ValidateAttendanceResponse } from '@/types'

export interface LinkValidationResult {
  valid: boolean
  reason: string
  message?: string
  employee_name?: string
  workplace_id?: string
  link_type?: string
  usage_count?: number
}

export const LINK_VALIDATION_MESSAGES: Record<string, string> = {
  invalid_link: 'هذا الرابط غير صالح أو انتهت صلاحيته.',
  expired_link: 'انتهت صلاحية رابط التسجيل.',
  already_used: 'تم استخدام رابط التسجيل مسبقًا.',
  disabled_link: 'الرابط معطل.',
  error: 'حدث خطأ أثناء التحقق من الرابط.',
}

/** Step 1 — validate the token through the lightweight edge function. */
export async function validateToken(token: string): Promise<LinkValidationResult> {
  const { data, error } = await supabase.functions.invoke('validate-link', {
    body: { token },
  })

  if (error) {
    return { valid: false, reason: 'error', message: 'حدث خطأ أثناء التحقق من الرابط.' }
  }

  const res = data as Partial<LinkValidationResult>
  if (res.valid === false) {
    return {
      valid: false,
      reason: res.reason ?? 'invalid_link',
      message: LINK_VALIDATION_MESSAGES[res.reason ?? 'invalid_link'] ?? 'الرابط غير صالح.',
    }
  }
  return res as LinkValidationResult
}

/** Step 2 — send geolocation to the validate-attendance edge function. */
export async function submitAttendance(payload: {
  token: string
  latitude: number
  longitude: number
  accuracy: number
  client_timestamp: string
}): Promise<ValidateAttendanceResponse> {
  const { data, error } = await supabase.functions.invoke('validate-attendance', {
    body: payload,
  })

  if (error) {
    return { success: false, message: 'حدث خطأ أثناء تسجيل البيانات.', status: 'error' }
  }

  return data as ValidateAttendanceResponse
}

export interface GeoResult {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

/**
 * Get current geolocation with high accuracy.
 * Rejects with a machine-readable code the page can translate.
 */
export function getCurrentPosition(timeoutMs = 15000): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
      },
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(new Error('permission_denied'))
            break
          case err.POSITION_UNAVAILABLE:
            reject(new Error('unavailable'))
            break
          case err.TIMEOUT:
            reject(new Error('timeout'))
            break
          default:
            reject(new Error('error'))
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    )
  })
}