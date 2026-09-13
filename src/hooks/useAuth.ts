import { useEffect, useState } from 'react'
import { getCurrentUser, isAdmin, type AuthUser } from '@/lib/supabase/auth'
import { supabase } from '@/lib/supabase/client'

interface AuthState {
  user: AuthUser | null
  loading: boolean
  isAdminUser: boolean
  error: string | null
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAdminUser: false,
    error: null,
  })

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const user = await getCurrentUser()
        if (!active) return
        if (!user) {
          setState({ user: null, loading: false, isAdminUser: false, error: null })
          return
        }
        const admin = await isAdmin(user.id)
        if (!active) return
        setState({ user, loading: false, isAdminUser: admin, error: admin ? null : 'غير مصرح لك بالدخول.' })
      } catch (err) {
        if (!active) return
        setState({ user: null, loading: false, isAdminUser: false, error: (err as Error).message })
      }
    }

    load()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        load()
      } else {
        setState({ user: null, loading: false, isAdminUser: false, error: null })
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return state
}