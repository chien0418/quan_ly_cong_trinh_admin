'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Employee } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

type AuthContextValue = {
  profile: Employee | null
  loading: boolean
  refreshProfile: () => Promise<Employee | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const supabase = createClient()
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) {
      setProfile(null)
      return null
    }

    const { data, error } = await supabase.rpc('get_my_employee_profile')
    if (error || !data) {
      setProfile(null)
      return null
    }

    const next = data as Employee
    setProfile(next)
    return next
  }, [])

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    ;(async () => {
      try {
        const next = await refreshProfile()
        if (!mounted) return
        setProfile(next)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void refreshProfile()
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [refreshProfile])

  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ profile, loading, refreshProfile, signOut }),
    [profile, loading, refreshProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
