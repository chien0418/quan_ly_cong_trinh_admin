'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_PIN, encodePin, isValidPin } from '@/lib/auth/pin'
import { useAuth } from '@/components/auth-provider'
import type { Employee } from '@/lib/types'

export default function LoginPage() {
  const router = useRouter()
  const { profile, refreshProfile } = useAuth()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile && !profile.must_change_password && ['admin', 'editor', 'viewer'].includes(profile.role)) {
      router.replace('/dashboard')
    }
  }, [profile, router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')

    const code = employeeCode.trim().toUpperCase()
    if (!code) return setError('社員コードを入力してください。')
    if (!isValidPin(pin)) return setError('PINは4桁の数字で入力してください。')

    setBusy(true)
    const supabase = createClient()

    try {
      const { data: emailData, error: emailError } = await supabase.rpc('lookup_login_email_by_employee_code', {
        p_employee_code: code,
      })
      if (emailError) throw emailError
      const email = String(emailData ?? '').trim()
      if (!email) throw new Error('社員コードが見つからないか、利用停止中です。')

      let signedIn = false
      const encodedPassword = encodePin(code, pin)
      const first = await supabase.auth.signInWithPassword({ email, password: encodedPassword })
      if (!first.error) signedIn = true

      if (!signedIn && pin === DEFAULT_PIN) {
        const legacy = await supabase.auth.signInWithPassword({ email, password: DEFAULT_PIN })
        if (!legacy.error) {
          signedIn = true
        } else {
          const activation = await supabase.functions.invoke('activate-employee-account', {
            body: { employee_code: code },
          })
          if (activation.error && activation.error.message) {
            const message = activation.error.message
            if (!message.includes('ACCOUNT_ALREADY_ACTIVATED')) {
              throw new Error(`初回アカウント有効化に失敗しました: ${message}`)
            }
          }

          const retry = await supabase.auth.signInWithPassword({ email, password: encodedPassword })
          if (!retry.error) signedIn = true
        }
      }

      if (!signedIn) throw new Error('社員コードまたはPINが正しくありません。')

      const { data: profileData, error: profileError } = await supabase.rpc('get_my_employee_profile')
      if (profileError || !profileData) throw profileError ?? new Error('社員プロフィールを取得できません。')
      const next = profileData as Employee

      if (!next.is_active) {
        await supabase.auth.signOut()
        throw new Error('この社員コードは利用停止中です。')
      }
      if (!['admin', 'editor', 'viewer'].includes(next.role)) {
        await supabase.auth.signOut()
        throw new Error('このアカウントではWeb画面を利用できません。')
      }

      await refreshProfile()
      router.replace(next.must_change_password ? '/change-pin' : '/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="hero-badge">
          <span>CURRENT SERVICE</span>
          <strong>現場管理</strong>
          <b>Web Admin</b>
        </div>
        <div>
          <h1>工事データを、<br />Webとアプリで一元管理。</h1>
          <p>工事一覧、工程進捗、資料PDF、更新履歴、社員権限を同じSupabaseデータで管理します。</p>
        </div>
        <small>Current Service Co., Ltd.</small>
      </section>
      <section className="login-side">
        <div className="login-card-main">
          <h2>ログイン</h2>
          <p>管理者・編集者用 Web 管理画面</p>
          <form className="login-form" onSubmit={submit}>
            <div className="form-field">
              <label>社員コード</label>
              <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="CS001" autoCapitalize="characters" />
            </div>
            <div className="form-field">
              <label>PIN（4桁）</label>
              <input className="pin-input" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" inputMode="numeric" type="password" />
            </div>
            {error && <div className="error-text">{error}</div>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? 'ログイン中...' : 'ログイン'}</button>
          </form>
        </div>
      </section>
    </main>
  )
}
