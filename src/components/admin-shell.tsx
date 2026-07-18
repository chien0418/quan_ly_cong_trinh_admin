'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { BarChart3, Boxes, BriefcaseBusiness, CalendarDays, Clock3, History, KeyRound, LogOut, Settings, ShoppingCart, Users } from 'lucide-react'
import { useAuth } from './auth-provider'
import { RouteGuard } from './route-guard'
import { Modal } from './modal'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: BarChart3 },
  { href: '/projects', label: '工事管理', icon: BriefcaseBusiness },
  { href: '/schedule', label: '進捗スケジュール', icon: CalendarDays },
  { href: '/procurement', label: '資材発注管理', icon: Boxes },
  { href: '/history', label: '更新履歴管理', icon: History },
  { href: '/orders', label: '発注履歴管理', icon: ShoppingCart },
]

export function AdminShell({ children }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function handleLogout() {
    await signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <RouteGuard>
      <div className="admin-layout">
        <aside className="sidebar">
          <div className="brand-badge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-logo" src="/current-service-app-logo.png" alt="Current Service" />
            <strong>（株）カレントサービス</strong>
          </div>

          <nav className="sidebar-nav">
            <section className="nav-section">
              <h2 className="nav-section-title">現場管理</h2>
              <div className="nav-section-items">
                {navItems.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const Icon = item.icon
                  return (
                    <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
                      <span className="nav-icon"><Icon size={18} /></span>
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </section>
            <section className="nav-section time-nav-section">
              <h2 className="nav-section-title">時間管理</h2>
              <div className="nav-section-items">
                <a className="nav-item" href="https://admin-v2.currentservice.jp/" target="_blank" rel="noopener noreferrer">
                  <span className="nav-icon"><Clock3 size={18} /></span>
                  <span>時間管理ホーム</span>
                </a>
              </div>
            </section>
          </nav>

          <div className="sidebar-bottom">
            {profile?.role === 'admin' && (
              <button className="nav-item button-nav" onClick={() => setSettingsOpen(true)}>
                <span className="nav-icon"><Settings size={18} /></span>
                設定
              </button>
            )}
            <div className="login-card">
              <span>LOGIN</span>
              <strong>{profile?.display_name ?? '—'}</strong>
              <small>{profile?.employee_code} / {profile?.role}</small>
              {profile?.role === 'viewer' && <em className="viewer-mode-badge">閲覧専用</em>}
            </div>
            <button className="nav-item button-nav" onClick={handleLogout}>
              <span className="nav-icon"><LogOut size={18} /></span>
              ログアウト
            </button>
          </div>
        </aside>

        <main className="main-area">
          <section className="content-area">{children}</section>
        </main>

        <Modal open={settingsOpen && profile?.role === 'admin'} title="設定" onClose={() => setSettingsOpen(false)}>
          <div className="settings-list">
            <Link className="settings-option" href="/employees" onClick={() => setSettingsOpen(false)}>
              <span className="settings-option-icon"><Users size={21} /></span>
              <span><strong>社員管理</strong><small>社員追加・利用停止・editor権限・PINリセットを管理します。</small></span>
            </Link>
            <Link className="settings-option" href="/change-pin?manual=1" onClick={() => setSettingsOpen(false)}>
              <span className="settings-option-icon"><KeyRound size={21} /></span>
              <span><strong>パスワード（PIN）変更</strong><small>ログイン用の4桁PINを変更します。</small></span>
            </Link>
            <div className="settings-coming-soon">
              <Settings size={18} />
              その他の設定は今後追加予定です。
            </div>
          </div>
        </Modal>
      </div>
    </RouteGuard>
  )
}
