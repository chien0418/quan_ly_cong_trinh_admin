'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { Project, WorkflowStep } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type ProjectSummary = Project & {
  steps: WorkflowStep[]
  completed: number
  total: number
  progress: number
  currentStep: WorkflowStep | null
}

function mapStatus(step: WorkflowStep | null) {
  if (!step) return '未着手'
  if (step.status.includes('完')) return '完了'
  if (step.status.includes('確認')) return '確認待ち'
  if (step.status.includes('保留')) return '保留'
  return '作業中'
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [employeeCount, setEmployeeCount] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    try {
      const projectResult = await supabase
        .from('projects')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (projectResult.error) throw projectResult.error

      const stepResult = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
      if (stepResult.error) throw stepResult.error

      const allSteps = (stepResult.data ?? []) as WorkflowStep[]
      const summaries = ((projectResult.data ?? []) as Project[]).map((project) => {
        const steps = allSteps.filter((step) => step.project_id === project.id)
        const completed = steps.filter((step) => step.status.includes('完') || step.title === '完了' && step.completed_at).length
        const total = steps.length
        const currentStep = steps.find((step) => !step.status.includes('完')) ?? steps.at(-1) ?? null
        return {
          ...project,
          steps,
          completed,
          total,
          progress: total === 0 ? 0 : Math.round((completed / total) * 100),
          currentStep,
        }
      })
      setProjects(summaries)

      if (profile?.role === 'admin') {
        const employeeResult = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true)
        if (!employeeResult.error) setEmployeeCount(employeeResult.count ?? 0)
      } else {
        setEmployeeCount(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [profile?.role])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    return {
      total: projects.length,
      work: projects.filter((p) => mapStatus(p.currentStep) === '作業中').length,
      wait: projects.filter((p) => mapStatus(p.currentStep) === '確認待ち').length,
      hold: projects.filter((p) => mapStatus(p.currentStep) === '保留').length,
    }
  }, [projects])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return projects.filter((project) => {
      const status = mapStatus(project.currentStep)
      const statusOk = filter === 'すべて' || filter === status
      const textOk = !keyword || `${project.display_name} ${project.project_code ?? ''} ${project.currentStep?.title ?? ''}`.toLowerCase().includes(keyword)
      return statusOk && textOk
    })
  }, [projects, query, filter])

  return (
    <AdminShell title="工程進捗管理" subtitle="株式会社 カレントサービス / 管理者・編集者 Web画面">
      <div className="metric-grid">
        <div className="metric-card"><span>工事数</span><strong>{counts.total}件</strong></div>
        <div className="metric-card"><span>作業中</span><strong>{counts.work}件</strong></div>
        <div className="metric-card"><span>確認待ち</span><strong>{counts.wait}件</strong></div>
        <div className="metric-card"><span>保留</span><strong>{counts.hold}件</strong></div>
        <div className="metric-card"><span>社員数</span><strong>{employeeCount === null ? '—' : `${employeeCount}人`}</strong></div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h2>工事一覧</h2><p>行をクリックすると工事詳細へ移動</p></div>
          <Link href="/projects" className="soft-button">工事管理を開く</Link>
        </div>
        <div className="toolbar">
          <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="工事名・工程名を検索" /></div>
          <div className="status-chips">
            {['すべて', '作業中', '確認待ち', '保留', '完了'].map((value) => (
              <button key={value} className={`chip ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}>{value}</button>
            ))}
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>工事名</th><th>現在工程</th><th>ボール持ち</th><th>進捗</th><th>完了日</th><th>更新日</th></tr></thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id} onClick={() => { window.location.href = `/projects/${project.id}` }} style={{ cursor: 'pointer' }}>
                  <td><strong>{project.display_name}</strong></td>
                  <td>{project.currentStep?.title ?? '—'}</td>
                  <td>{project.currentStep?.current_ball_text ?? '—'}</td>
                  <td><strong>{project.completed}/{project.total}</strong>（{project.progress}%）</td>
                  <td>{formatDate(project.steps.filter((s) => s.completed_at).at(-1)?.completed_at)}</td>
                  <td>{formatDate(project.updated_at)}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={6}><div className="empty-state">工事データがありません。</div></td></tr>}
              {loading && <tr><td colSpan={6}><div className="empty-state">読み込み中...</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}
