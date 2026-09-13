import type { AttendanceStatus, VerificationLevel } from '@/types'

/**
 * Haversine distance in meters.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function formatMeters(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—'
  if (meters < 1000) return `${Math.round(meters)} متر`
  return `${(meters / 1000).toFixed(2)} كم`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(iso: string | null | undefined): string {
  return `${formatDate(iso)} ${formatTime(iso)}`
}

export function formatDuration(duration: string): string {
  const map: Record<string, string> = {
    '1h': 'ساعة',
    '1d': 'يوم',
    '3d': '3 أيام',
    '1w': 'أسبوع',
    never: 'بدون انتهاء',
  }
  return map[duration] ?? duration
}

export function attendanceStatusText(status: AttendanceStatus): string {
  const map: Record<AttendanceStatus, string> = {
    inside: 'داخل المقر',
    outside: 'خارج المقر',
    low_accuracy: 'دقة منخفضة',
    location_denied: 'رفض الموقع',
    expired_link: 'رابط منتهي',
    invalid_link: 'رابط غير صالح',
    already_used: 'مستخدم مسبقًا',
    disabled_link: 'رابط معطل',
    error: 'خطأ',
  }
  return map[status]
}

export function verificationLevelText(level: VerificationLevel | null): string {
  if (!level) return '—'
  const map: Record<VerificationLevel, string> = {
    high: 'عالية',
    medium: 'متوسطة',
    low: 'منخفضة',
  }
  return map[level]
}

export function truncateUrl(url: string, max = 40): string {
  if (!url) return '—'
  return url.length > max ? `${url.slice(0, max)}…` : url
}