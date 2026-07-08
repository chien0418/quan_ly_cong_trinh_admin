'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BarChart3, Boxes, BriefcaseBusiness, History, LogOut, RefreshCw, Settings, ShoppingCart, Users } from 'lucide-react'
import { useAuth } from './auth-provider'
import { RouteGuard } from './route-guard'

const navItems = [
  { href: '/dashboard', label: 'ダッシュボード', icon: BarChart3 },
  { href: '/projects', label: '工事管理', icon: BriefcaseBusiness },
  { href: '/procurement', label: '資材発注管理', icon: Boxes },
  { href: '/history', label: '更新履歴管理', icon: History },
  { href: '/orders', label: '発注履歴管理', icon: ShoppingCart },
]

export function AdminShell({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut, refreshProfile } = useAuth()

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
            <span className="brand-small">CURRENT</span>
            <strong>工程進捗</strong>
            <b>Admin</b>
          </div>

          <nav className="sidebar-nav">
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
            {profile?.role === 'admin' && (
              <Link href="/employees" className={`nav-item ${pathname.startsWith('/employees') ? 'active' : ''}`}>
                <span className="nav-icon"><Users size={18} /></span>
                社員管理
              </Link>
            )}
          </nav>

          <div className="sidebar-bottom">
            <div className="login-card">
              <span>LOGIN</span>
              <strong>{profile?.display_name ?? '—'}</strong>
              <small>{profile?.employee_code} / {profile?.role}</small>
            </div>
            <button className="nav-item button-nav" onClick={handleLogout}>
              <span className="nav-icon"><LogOut size={18} /></span>
              ログアウト
            </button>
          </div>
        </aside>

        <main className="main-area">
          <header className="page-topbar">
            <div>
              <h1>{title}</h1>
              <p>{subtitle ?? '株式会社 カレントサービス / 工程進捗管理'}</p>
            </div>
            <div className="topbar-actions">
              <button className="soft-button" onClick={() => void refreshProfile()} title="権限を更新">
                <RefreshCw size={17} />
                権限更新
              </button>
              <Link className="soft-button" href="/change-pin?manual=1">
                <Settings size={17} />
                PIN変更
              </Link>
              <div className="logo-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/current-logo.png" alt="Current Service" />
              </div>
            </div>
          </header>
          <section className="content-area">{children}</section>
        </main>
      </div>
    </RouteGuard>
  )
}
