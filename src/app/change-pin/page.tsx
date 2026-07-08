'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_PIN, encodePin, isValidPin } from '@/lib/auth/pin'

export default function ChangePinPage() {
  const router = useRouter()
  const { profile, loading, refreshProfile } = useAuth()
  const manual = profile ? !profile.must_change_password : false
  const [currentPin, setCurrentPin] = useState('')
  const [nextPin, setNextPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && !profile) router.replace('/login')
  }, [loading, profile, router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!profile) return
    if (!isValidPin(nextPin)) return setError('新しいPINは4桁の数字で入力してください。')
    if (nextPin === DEFAULT_PIN) return setError('0000は新しいPINとして使用できません。')
    if (nextPin !== confirmPin) return setError('新しいPINと確認PINが一致しません。')
    if (manual && !isValidPin(currentPin)) return setError('現在のPINを入力してください。')

    setBusy(true)
    const supabase = createClient()
    try {
      if (manual && !profile.must_change_password) {
        const { data: emailData, error: emailError } = await supabase.rpc('lookup_login_email_by_employee_code', {
          p_employee_code: profile.employee_code,
        })
        if (emailError) throw emailError
        const email = String(emailData ?? '')
        const verify = await supabase.auth.signInWithPassword({
          email,
          password: encodePin(profile.employee_code, currentPin),
        })
        if (verify.error) throw new Error('現在のPINが正しくありません。')
      }

      const update = await supabase.auth.updateUser({
        password: encodePin(profile.employee_code, nextPin),
      })
      if (update.error) throw update.error

      const mark = await supabase.rpc('mark_own_password_changed')
      if (mark.error) throw new Error(`PINは更新されましたが、プロフィール更新に失敗しました: ${mark.error.message}`)

      await refreshProfile()
      router.replace('/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (loading || !profile) return <div className="page-loader"><div className="loader-ring" /><p>読み込み中...</p></div>

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="hero-badge"><span>CURRENT SERVICE</span><strong>PIN変更</strong></div>
        <div><h1>安全な4桁PINを<br />設定してください。</h1><p>初回ログイン時はPIN変更が完了するまで管理画面へ進めません。</p></div>
      </section>
      <section className="login-side">
        <div className="login-card-main">
          <h2>PIN変更</h2>
          <p>{profile.employee_code} / {profile.display_name}</p>
          <form className="login-form" onSubmit={submit}>
            {manual && !profile.must_change_password && (
              <div className="form-field"><label>現在のPIN</label><input className="pin-input" type="password" inputMode="numeric" value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
            )}
            <div className="form-field"><label>新しいPIN</label><input className="pin-input" type="password" inputMode="numeric" value={nextPin} onChange={(e) => setNextPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
            <div className="form-field"><label>新しいPIN確認</label><input className="pin-input" type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
            {error && <div className="error-text">{error}</div>}
            <button className="primary-button" type="submit" disabled={busy}>{busy ? '保存中...' : '保存'}</button>
          </form>
        </div>
      </section>
    </main>
  )
}
