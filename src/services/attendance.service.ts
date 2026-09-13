import { supabase } from '@/lib/supabase/client'
import type { AttendanceRecord, AttendanceStatus } from '@/types'

export interface RecordsFilter {
  employee_id?: string
  workplace_id?: string
  status?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export async function getRecords(filters: RecordsFilter = {}) {
  let query = supabase
    .from('attendance_records')
    .select('*, employee:employees(id,name,employee_number,department), workplace:workplaces(id,name), link:attendance_links(id,token_hash,original_url,link_type)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (filters.employee_id) query = query.eq('employee_id', filters.employee_id)
  if (filters.workplace_id) query = query.eq('workplace_id', filters.workplace_id)
  if (filters.status) query = query.eq('attendance_status', filters.status)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)

  const limit = filters.limit ?? 50
  const offset = filters.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data as AttendanceRecord[], count: count ?? 0 }
}

export async function getRecord(id: string) {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*, employee:employees(id,name,employee_number,department,phone), workplace:workplaces(id,name,latitude,longitude,allowed_radius), link:attendance_links(id,token_hash,original_url,link_type,expires_at,usage_count)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as AttendanceRecord
}

export async function getDashboardStats() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  const [employeesRes, todayRes, insideRes, outsideRes, lowAccRes, activeLinksRes, usedLinksRes, expiredLinksRes, recentRes] = await Promise.all([
    supabase.from('employees').select('id', { count: 'exact', head: true }),
    supabase.from('attendance_records').select('id', { count: 'exact', head: true }).gte('created_at', todayISO),
    supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_status', 'inside').gte('created_at', todayISO),
    supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_status', 'outside').gte('created_at', todayISO),
    supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_status', 'low_accuracy').gte('created_at', todayISO),
    supabase.from('attendance_links').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('attendance_links').select('id', { count: 'exact', head: true }).eq('status', 'used'),
    supabase.from('attendance_links').select('id', { count: 'exact', head: true }).in('status', ['expired', 'disabled']),
    supabase.from('attendance_records')
      .select('*, employee:employees(id,name,employee_number), workplace:workplaces(id,name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  return {
    totalEmployees: employeesRes.count ?? 0,
    todayCheckins: todayRes.count ?? 0,
    insideCount: insideRes.count ?? 0,
    outsideCount: outsideRes.count ?? 0,
    lowAccuracyCount: lowAccRes.count ?? 0,
    activeLinks: activeLinksRes.count ?? 0,
    expiredLinks: (expiredLinksRes.count ?? 0) + (usedLinksRes.count ?? 0),
    recentRecords: (recentRes.data ?? []) as AttendanceRecord[],
  }
}

export async function getTodayHourlyData(): Promise<{ hour: string; count: number }[]> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('attendance_records')
    .select('created_at')
    .gte('created_at', todayStart.toISOString())
    .lt('created_at', tomorrow.toISOString())

  if (error) throw error

  const buckets = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
  for (const rec of data ?? []) {
    const hour = new Date(rec.created_at).getUTCHours()
    if (buckets[hour]) buckets[hour].count += 1
  }
  return buckets.map((b) => ({
    hour: `${b.hour.toString().padStart(2, '0')}:00`,
    count: b.count,
  }))
}

export async function exportCsv(filters: RecordsFilter = {}): Promise<Blob> {
  let query = supabase
    .from('attendance_records')
    .select('*, employee:employees(name,employee_number,department), workplace:workplaces(name)')
    .order('created_at', { ascending: false })

  if (filters.employee_id) query = query.eq('employee_id', filters.employee_id)
  if (filters.workplace_id) query = query.eq('workplace_id', filters.workplace_id)
  if (filters.status) query = query.eq('attendance_status', filters.status)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as AttendanceRecord[]
  const header = [
    'name', 'employee_number', 'department', 'workplace', 'attendance_status',
    'verification_level', 'distance_meters', 'accuracy', 'latitude', 'longitude',
    'server_timestamp', 'client_timestamp', 'ip_address', 'risk_flags',
  ].join(',')

  const body = rows
    .map((r) =>
      [
        csvEscape(r.employee?.name ?? ''),
        csvEscape(r.employee?.employee_number ?? ''),
        csvEscape(r.employee?.department ?? ''),
        csvEscape(r.workplace?.name ?? ''),
        r.attendance_status,
        r.verification_level ?? '',
        r.distance_meters ?? '',
        r.accuracy ?? '',
        r.latitude ?? '',
        r.longitude ?? '',
        r.server_timestamp,
        r.client_timestamp ?? '',
        csvEscape(r.ip_address ?? ''),
        `"${(r.risk_flags ?? []).join(';')}"`,
      ].join(','),
    )
    .join('\n')

  // BOM for Arabic Excel support
  return new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' })
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function attendanceStatusLabel(status: AttendanceStatus): string {
  const map: Record<AttendanceStatus, string> = {
    inside: 'داخل المقر',
    outside: 'خارج المقر',
    low_accuracy: 'دقة منخفضة',
    location_denied: 'رفض الموقع',
    expired_link: 'رابط منتهي',
    invalid_link: 'رابط غير صالح',
    already_used: 'تم استخدامه',
    disabled_link: 'رابط معطل',
    error: 'خطأ',
  }
  return map[status]
}