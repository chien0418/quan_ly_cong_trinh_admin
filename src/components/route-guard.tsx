'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './auth-provider'
import type { UserRole } from '@/lib/types'

export function RouteGuard({
  children,
  roles = ['admin', 'editor'],
}: {
  children: React.ReactNode
  roles?: UserRole[]
}) {
  const router = useRouter()
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!profile) {
      router.replace('/login')
      return
    }
    if (profile.must_change_password) {
      router.replace('/change-pin')
      return
    }
    if (!roles.includes(profile.role)) {
      router.replace('/login?error=web-role')
    }
  }, [loading, profile, roles, router])

  if (loading || !profile || profile.must_change_password || !roles.includes(profile.role)) {
    return (
      <div className="page-loader">
        <div className="loader-ring" />
        <p>読み込み中...</p>
      </div>
    )
  }

  return <>{children}</>
}
