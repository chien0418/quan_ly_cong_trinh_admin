'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { createClient } from '@/lib/supabase/client'
import type { Project, UpdateLog } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

type LogWithProject = UpdateLog & { projectName: string }

const actionLabels: Record<string, string> = {
  insert: '追加',
  update: '変更',
  delete: '削除',
  restore: '復元',
  export: '出力',
}

const targetLabels: Record<string, string> = {
  projects: '工事',
  workflow_steps: '工程',
  checklist_items: 'チェック項目',
  documents: '資料',
  drawing_folders: '図面フォルダ',
  drawing_files: '図面',
  employees: '社員',
  purchase_orders: '発注',
  purchase_order_lines: '発注明細',
}

function compactValue(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const json = JSON.stringify(value)
    return json.length > 120 ? `${json.slice(0, 117)}...` : json
  } catch {
    return String(value)
  }
}

function actionBadge(action: string) {
  if (action === 'insert' || action === 'restore') return 'done'
  if (action === 'delete') return 'hold'
  if (action === 'export') return 'work'
  return 'wait'
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogWithProject[]>([])
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('すべて')
  const [targetFilter, setTargetFilter] = useState('すべて')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    try {
      const [logResult, projectResult] = await Promise.all([
        supabase.from('update_logs').select('*').order('created_at', { ascending: false }).limit(1000),
        supabase.from('projects').select('*').is('deleted_at', null),
      ])
      if (logResult.error) throw logResult.error
      if (projectResult.error) throw projectResult.error

      const projectMap = new Map(((projectResult.data ?? []) as Project[]).map((project) => [project.id, project.display_name]))
      setLogs(((logResult.data ?? []) as UpdateLog[]).map((log) => ({
        ...log,
        projectName: log.project_id ? (projectMap.get(log.project_id) ?? '削除済み工事') : '共通・システム',
      })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    total: logs.length,
    today: logs.filter((log) => new Date(log.created_at).toDateString() === new Date().toDateString()).length,
    update: logs.filter((log) => log.action === 'update').length,
    delete: logs.filter((log) => log.action === 'delete').length,
  }), [logs])

  const targetOptions = useMemo(() => {
    return [...new Set(logs.map((log) => log.target_table))].sort()
  }, [logs])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return logs.filter((log) => {
      const actionOk = actionFilter === 'すべて' || log.action === actionFilter
      const targetOk = targetFilter === 'すべて' || log.target_table === targetFilter
      const text = [
        log.projectName,
        log.actor_name_snapshot ?? '',
        targetLabels[log.target_table] ?? log.target_table,
        log.field_name ?? '',
        compactValue(log.old_value),
        compactValue(log.new_value),
      ].join(' ').toLowerCase()
      return actionOk && targetOk && (!keyword || text.includes(keyword))
    })
  }, [logs, query, actionFilter, targetFilter])

  return (
    <AdminShell title="更新履歴管理" subtitle="工事・工程・資料・社員などの変更履歴を確認します">
      <div className="metric-grid history-metric-grid">
        <div className="metric-card"><span>履歴件数</span><strong>{counts.total}件</strong></div>
        <div className="metric-card"><span>本日の更新</span><strong>{counts.today}件</strong></div>
        <div className="metric-card"><span>変更</span><strong>{counts.update}件</strong></div>
        <div className="metric-card"><span>削除</span><strong>{counts.delete}件</strong></div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h2>更新履歴一覧</h2><p>直近1,000件を新しい順に表示</p></div>
          <button className="soft-button" onClick={() => void load()}>再読込</button>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="工事名・操作担当者・項目・変更内容を検索" />
          </div>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="compact-select">
            <option value="すべて">すべての操作</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)} className="compact-select">
            <option value="すべて">すべての対象</option>
            {targetOptions.map((value) => <option key={value} value={value}>{targetLabels[value] ?? value}</option>)}
          </select>
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="table-wrap">
          <table className="data-table history-table">
            <thead>
              <tr><th>日時</th><th>工事</th><th>操作担当者</th><th>対象</th><th>操作</th><th>項目</th><th>変更前</th><th>変更後</th></tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.created_at)}</td>
                  <td><strong>{log.projectName}</strong></td>
                  <td>{log.actor_name_snapshot ?? '—'}</td>
                  <td>{targetLabels[log.target_table] ?? log.target_table}</td>
                  <td><span className={`badge ${actionBadge(log.action)}`}>{actionLabels[log.action] ?? log.action}</span></td>
                  <td>{log.field_name ?? '—'}</td>
                  <td className="history-value-cell" title={compactValue(log.old_value)}>{compactValue(log.old_value)}</td>
                  <td className="history-value-cell" title={compactValue(log.new_value)}>{compactValue(log.new_value)}</td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={8}><div className="empty-state">更新履歴がありません。</div></td></tr>}
              {loading && <tr><td colSpan={8}><div className="empty-state">読み込み中...</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}
