import { supabase } from '@/lib/supabase/client'
import type { Employee } from '@/types'

export async function getEmployees(params?: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}) {
  let query = supabase
    .from('employees')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (params?.search) {
    query = query.or(`name.ilike.%${params.search}%,employee_number.ilike.%${params.search}%`)
  }
  if (params?.status) {
    query = query.eq('status', params.status)
  }

  const limit = params?.limit ?? 50
  const offset = params?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error
  return { data: data as Employee[], count: count ?? 0 }
}

export async function getEmployee(id: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Employee
}

export async function createEmployee(emp: Omit<Employee, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('employees')
    .insert(emp)
    .select()
    .single()
  if (error) throw error
  return data as Employee
}

export async function updateEmployee(id: string, updates: Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>) {
  const { data, error } = await supabase
    .from('employees')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Employee
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase
    .from('employees')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function getActiveEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active')
    .order('name')
  if (error) throw error
  return data as Employee[]
}