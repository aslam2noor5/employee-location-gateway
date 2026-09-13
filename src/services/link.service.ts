import { supabase } from '@/lib/supabase/client'
import type { AttendanceLink, LinkType } from '@/types'

export interface CreateLinkInput {
  employee_id: string
  workplace_id: string
  original_url: string
  link_type: LinkType
  duration: '1h' | '1d' | '3d' | '1w' | 'never'
  max_usage_count?: number
}

export function buildCheckUrl(token: string): string {
  const base = window.location.origin
  return `${base}/check/${token}`
}

/**
 * Create the intermediate link through the admin-only edge function.
 * The raw token is generated & encrypted server-side; only the hash
 * is searchable in the database. Returns the raw token once.
 */
export async function createLink(input: CreateLinkInput) {
  const { data, error } = await supabase.functions.invoke('create-attendance-link', {
    body: {
      employee_id: input.employee_id,
      workplace_id: input.workplace_id,
      original_url: input.original_url,
      link_type: input.link_type,
      duration: input.duration,
      max_usage_count: input.max_usage_count ?? null,
    },
  })

  if (error) {
    let message = 'حدث خطأ أثناء إنشاء الرابط.'
    if (data && typeof data === 'object' && 'message' in data) {
      message = String((data as { message: string }).message)
    }
    throw new Error(message)
  }

  const token = (data as { token: string }).token
  const link = await getLink((data as { id: string }).id)
  return { link, token }
}

/** Decrypt a link's raw token via the admin-only edge function. */
export async function getLinkRawToken(linkId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('get-link-token', {
    body: { link_id: linkId },
  })
  if (error || !data?.token) throw new Error('تعذر الحصول على الرابط.')
  return (data as { token: string }).token
}

export async function getLinks(params?: {
  status?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('attendance_links')
    .select('*, employee:employees(id,name,employee_number), workplace:workplaces(id,name)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (params?.status) {
    query = query.eq('status', params.status)
  }

  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data as AttendanceLink[], count: count ?? 0 }
}

export async function getLink(id: string) {
  const { data, error } = await supabase
    .from('attendance_links')
    .select('*, employee:employees(id,name,employee_number), workplace:workplaces(id,name)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as AttendanceLink
}

export async function disableLink(id: string) {
  const { error } = await supabase
    .from('attendance_links')
    .update({ status: 'disabled', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function enableLink(id: string) {
  const { data: current } = await supabase
    .from('attendance_links')
    .select('status, expires_at')
    .eq('id', id)
    .single()

  const expired = current?.expires_at && new Date(current.expires_at).getTime() < Date.now()
  const nextStatus = expired ? 'expired' : 'active'

  const { error } = await supabase
    .from('attendance_links')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteLink(id: string) {
  const { error } = await supabase
    .from('attendance_links')
    .delete()
    .eq('id', id)
  if (error) throw error
}