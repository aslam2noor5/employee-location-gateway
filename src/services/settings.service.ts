import { supabase } from '@/lib/supabase/client'
import type { AppSettings } from '@/types'

const DEFAULT_SETTINGS: AppSettings = {
  allow_outside_redirect: false,
  global_min_accuracy: 100,
}

export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')

  if (error) throw error

  const result: AppSettings = { ...DEFAULT_SETTINGS }
  if (data) {
    for (const row of data) {
      if (row.key === 'allow_outside_redirect') {
        result.allow_outside_redirect = row.value === true
      }
      if (row.key === 'global_min_accuracy') {
        result.global_min_accuracy = Number(row.value) || DEFAULT_SETTINGS.global_min_accuracy
      }
    }
  }
  return result
}

export async function updateSettings(settings: Partial<AppSettings>) {
  const ops: { key: string; value: unknown }[] = []
  if (settings.allow_outside_redirect !== undefined) {
    ops.push({ key: 'allow_outside_redirect', value: settings.allow_outside_redirect })
  }
  if (settings.global_min_accuracy !== undefined) {
    ops.push({ key: 'global_min_accuracy', value: settings.global_min_accuracy })
  }

  for (const op of ops) {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: op.key, value: op.value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw error
  }
}