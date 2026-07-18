'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit3, Plus, Search, Trash2 } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { Modal } from '@/components/modal'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import { DEFAULT_WORKFLOW_TITLES } from '@/lib/constants'
import type { Project, WorkflowStep } from '@/lib/types'
import { formatDate } from '@/lib/utils'

type ProjectWithProgress = Project & { completed: number; total: number; currentStep: string; ball: string | null }

export default function ProjectsPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'editor'
  const [projects, setProjects] = useState<ProjectWithProgress[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [editProject, setEditProject] = useState<ProjectWithProgress | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    const supabase = createClient()
    setError('')
    try {
      const projectRes = await supabase.from('projects').select('*').is('deleted_at', null).order('created_at', { ascending: false })
      if (projectRes.error) throw projectRes.error
      const stepRes = await supabase.from('workflow_steps').select('*').eq('is_active', true).order('display_order')
      if (stepRes.error) throw stepRes.error
      const steps = (stepRes.data ?? []) as WorkflowStep[]
      const rows = ((projectRes.data ?? []) as Project[]).map((project) => {
        const projectSteps = steps.filter((step) => step.project_id === project.id)
        const completed = projectSteps.filter((step) => step.status.includes('完') || Boolean(step.completed_at)).length
        const current = projectSteps.find((step) => !step.status.includes('完')) ?? projectSteps.at(-1)
        return {
          ...project,
          completed,
          total: projectSteps.length,
          currentStep: current?.title ?? '—',
          ball: current?.current_ball_text ?? null,
        }
      })
      setProjects(rows)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  function openCreate() {
    if (!canEdit) return
    setEditProject(null)
    setName('')
    setDescription('')
    setOpen(true)
  }

  function openEdit(project: ProjectWithProgress) {
    if (!canEdit) return
    setEditProject(project)
    setName(project.display_name)
    setDescription(project.description ?? '')
    setOpen(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile || !canEdit) return
    if (!name.trim()) return setError('工事名を入力してください。')
    setBusy(true)
    setError('')
    const supabase = createClient()
    try {
      if (editProject) {
        const result = await supabase.from('projects').update({
          display_name: name.trim(),
          description: description.trim() || null,
          updated_by: profile.id,
        }).eq('id', editProject.id)
        if (result.error) throw result.error
        await supabase.from('update_logs').insert({
          project_id: editProject.id,
          target_table: 'projects',
          target_id: editProject.id,
          action: 'update',
          field_name: 'project_info',
          old_value: { display_name: editProject.display_name, description: editProject.description },
          new_value: { display_name: name.trim(), description: description.trim() || null },
          actor_employee_id: profile.id,
          actor_name_snapshot: profile.display_name,
        })
      } else {
        const created = await supabase.from('projects').insert({
          display_name: name.trim(),
          description: description.trim() || null,
          status: 'active',
          created_by: profile.id,
          updated_by: profile.id,
        }).select().single()
        if (created.error) throw created.error
        const projectId = created.data.id as string
        const workflowRows = DEFAULT_WORKFLOW_TITLES.map((title, index) => ({
          project_id: projectId,
          title,
          display_order: index + 1,
          status: '未着手',
          is_stage_marker: false,
          is_active: true,
          detail: {
            assignee_name: profile.display_name,
            detail_status_label: title === 'データ受領' ? '未受領' : title === '3D・フロー図確認' ? '確認中' : title === '見積り' ? '未提出' : title === '完了' ? '未完了' : '未着手',
            can_have_children: title !== '完了' && title !== '現場工事',
            is_system_node: title === '完了',
          },
          created_by: profile.id,
          updated_by: profile.id,
        }))
        const workflowInsert = await supabase.from('workflow_steps').insert(workflowRows)
        if (workflowInsert.error) throw workflowInsert.error
        await supabase.from('update_logs').insert({
          project_id: projectId,
          target_table: 'projects',
          target_id: projectId,
          action: 'insert',
          field_name: 'project_create',
          new_value: { display_name: name.trim() },
          actor_employee_id: profile.id,
          actor_name_snapshot: profile.display_name,
        })
      }
      setOpen(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(project: ProjectWithProgress) {
    if (!canEdit) return
    if (!confirm(`「${project.display_name}」を削除しますか？`)) return
    const supabase = createClient()
    const result = await supabase.from('projects').update({ deleted_at: new Date().toISOString(), updated_by: profile?.id ?? null }).eq('id', project.id)
    if (result.error) return setError(result.error.message)
    await load()
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return projects
    return projects.filter((p) => `${p.display_name} ${p.project_code ?? ''} ${p.currentStep}`.toLowerCase().includes(keyword))
  }, [projects, query])

  return (
    <AdminShell title="工事管理">
      <div className="panel">
        <div className="panel-header">
          <div><h2>工事一覧</h2><p>Webで追加・編集した内容はSupabaseへ即時保存されます。</p></div>
          {canEdit && <button className="primary-button" onClick={openCreate}><Plus size={18} />新規工事追加</button>}
        </div>
        <div className="toolbar">
          <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="工事名を検索" /></div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>工事名</th><th>現在工程</th><th>ボール持ち</th><th>進捗</th><th>作成日</th><th>操作</th></tr></thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id}>
                  <td><Link href={`/projects/${project.id}`}><strong>{project.display_name}</strong></Link></td>
                  <td>{project.currentStep}</td>
                  <td>{project.ball ?? '—'}</td>
                  <td>{project.completed}/{project.total}</td>
                  <td>{formatDate(project.created_at)}</td>
                  <td>{canEdit ? <div className="table-actions">
                    <button className="icon-button" onClick={() => openEdit(project)} title="編集"><Edit3 size={17} /></button>
                    <button className="icon-button danger" onClick={() => void remove(project)} title="削除"><Trash2 size={17} /></button>
                  </div> : '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6}><div className="empty-state">工事データがありません。</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={open && canEdit} title={editProject ? '工事情報編集' : '新規工事追加'} onClose={() => setOpen(false)}>
        <form onSubmit={save}>
          <div className="form-grid">
            <div className="form-field full"><label>工事名</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="form-field full"><label>説明</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setOpen(false)}>キャンセル</button><button className="primary-button" disabled={busy}>{busy ? '保存中...' : '保存'}</button></div>
        </form>
      </Modal>
    </AdminShell>
  )
}
