'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { createClient } from '@/lib/supabase/client'
import type { DrawingFile, DrawingFolder, Project, WorkflowStep } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

type DrawingView = DrawingFile & {
  projectName: string
  folderName: string
  stepName: string
}

export default function DrawingsPage() {
  const [drawings, setDrawings] = useState<DrawingView[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const [projectRes, folderRes, fileRes, stepRes] = await Promise.all([
      supabase.from('projects').select('*').is('deleted_at', null),
      supabase.from('drawing_folders').select('*').eq('is_active', true),
      supabase.from('drawing_files').select('*').eq('is_deleted', false).order('submitted_at', { ascending: false }),
      supabase.from('workflow_steps').select('*').eq('is_active', true),
    ])
    if (projectRes.error) return setError(projectRes.error.message)
    if (folderRes.error) return setError(folderRes.error.message)
    if (fileRes.error) return setError(fileRes.error.message)
    if (stepRes.error) return setError(stepRes.error.message)

    const projects = (projectRes.data ?? []) as Project[]
    const folders = (folderRes.data ?? []) as DrawingFolder[]
    const steps = (stepRes.data ?? []) as WorkflowStep[]
    const projectMap = new Map(projects.map((item) => [item.id, item.display_name]))
    const folderMap = new Map(folders.map((item) => [item.id, item]))
    const stepMap = new Map(steps.map((item) => [item.id, item.title]))

    setDrawings(((fileRes.data ?? []) as DrawingFile[]).map((file) => {
      const folder = folderMap.get(file.drawing_folder_id)
      return {
        ...file,
        folderName: folder?.folder_name ?? '—',
        projectName: folder ? (projectMap.get(folder.project_id) ?? '—') : '—',
        stepName: file.workflow_step_id ? (stepMap.get(file.workflow_step_id) ?? '不明工程') : '共通図面',
      }
    }))
  }, [])

  useEffect(() => { void load() }, [load])

  async function openDrawing(drawing: DrawingFile) {
    const supabase = createClient()
    const signed = await supabase.storage.from(drawing.storage_bucket).createSignedUrl(drawing.storage_path, 300)
    if (signed.error) return setError(signed.error.message)
    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return drawings
    return drawings.filter((item) => `${item.projectName} ${item.folderName} ${item.stepName} ${item.file_name} ${item.version_label}`.toLowerCase().includes(keyword))
  }, [drawings, query])

  return (
    <AdminShell title="図面管理">
      <div className="panel">
        <div className="panel-header"><div><h2>全工事 図面一覧</h2><p>工事・フォルダ・工程・版ごとに管理された図面</p></div></div>
        <div className="toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="工事名・工程・フォルダ・図面名を検索" /></div></div>
        {error && <p className="error-text">{error}</p>}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>工事名</th><th>フォルダ</th><th>工程</th><th>図面名</th><th>版</th><th>登録日</th><th>開く</th></tr></thead><tbody>
          {filtered.map((drawing) => <tr key={drawing.id}><td><strong>{drawing.projectName}</strong></td><td>{drawing.folderName}</td><td><span className="badge work">{drawing.stepName}</span></td><td>{drawing.file_name}</td><td>{drawing.version_label}</td><td>{formatDateTime(drawing.submitted_at)}</td><td><button className="icon-button" onClick={() => void openDrawing(drawing)}><Download size={17} /></button></td></tr>)}
          {filtered.length === 0 && <tr><td colSpan={7}><div className="empty-state">図面がありません。</div></td></tr>}
        </tbody></table></div>
      </div>
    </AdminShell>
  )
}
