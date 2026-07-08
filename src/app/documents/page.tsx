'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { createClient } from '@/lib/supabase/client'
import type { DocumentRow, Project, WorkflowStep } from '@/lib/types'
import { formatDateTime, humanBytes } from '@/lib/utils'

type DocumentWithProject = DocumentRow & { projectName: string; stepName: string }

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentWithProject[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const [docRes, projectRes, stepRes] = await Promise.all([
      supabase.from('documents').select('*').eq('is_deleted', false).order('uploaded_at', { ascending: false }),
      supabase.from('projects').select('*').is('deleted_at', null),
      supabase.from('workflow_steps').select('*').eq('is_active', true),
    ])
    if (docRes.error) return setError(docRes.error.message)
    if (projectRes.error) return setError(projectRes.error.message)
    if (stepRes.error) return setError(stepRes.error.message)

    const projectMap = new Map(((projectRes.data ?? []) as Project[]).map((project) => [project.id, project.display_name]))
    const stepMap = new Map(((stepRes.data ?? []) as WorkflowStep[]).map((step) => [step.id, step.title]))
    setDocuments(((docRes.data ?? []) as DocumentRow[]).map((document) => ({
      ...document,
      projectName: projectMap.get(document.project_id) ?? '—',
      stepName: document.workflow_step_id ? (stepMap.get(document.workflow_step_id) ?? '不明工程') : '共通資料',
    })))
  }, [])

  useEffect(() => { void load() }, [load])

  async function openDocument(document: DocumentRow) {
    const supabase = createClient()
    const signed = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 300)
    if (signed.error) return setError(signed.error.message)
    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return documents
    return documents.filter((document) => `${document.projectName} ${document.stepName} ${document.file_name} ${document.version_label}`.toLowerCase().includes(keyword))
  }, [documents, query])

  return (
    <AdminShell title="資料管理">
      <div className="panel">
        <div className="panel-header"><div><h2>全工事 資料一覧</h2><p>工事・工程ごとにSupabase Storageへ保存された資料</p></div></div>
        <div className="toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="工事名・工程名・ファイル名を検索" /></div></div>
        {error && <p className="error-text">{error}</p>}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>工事名</th><th>工程</th><th>ファイル名</th><th>版</th><th>サイズ</th><th>登録日</th><th>開く</th></tr></thead><tbody>
          {filtered.map((document) => <tr key={document.id}><td><strong>{document.projectName}</strong></td><td><span className="badge work">{document.stepName}</span></td><td>{document.file_name}</td><td>{document.version_label}</td><td>{humanBytes(document.file_size_bytes)}</td><td>{formatDateTime(document.uploaded_at)}</td><td><button className="icon-button" onClick={() => void openDocument(document)}><Download size={17} /></button></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={7}><div className="empty-state">資料がありません。</div></td></tr>}
        </tbody></table></div>
      </div>
    </AdminShell>
  )
}
