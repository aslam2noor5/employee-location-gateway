import { supabase } from '@/lib/supabase/client'
import type { Workplace } from '@/types'

export async function getWorkplaces() {
  const { data, error } = await supabase
    .from('workplaces')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Workplace[]
}

export async function createWorkplace(wp: Omit<Workplace, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('workplaces')
    .insert(wp)
    .select()
    .single()
  if (error) throw error
  return data as Workplace
}

export async function updateWorkplace(id: string, updates: Partial<Omit<Workplace, 'id' | 'created_at' | 'updated_at'>>) {
  const { data, error } = await supabase
    .from('workplaces')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Workplace
}

export async function deleteWorkplace(id: string) {
  const { error } = await supabase
    .from('workplaces')
    .delete()
    .eq('id', id)
  if (error) throw error
}