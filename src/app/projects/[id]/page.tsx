'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckSquare, Download, Edit3, FileUp, FolderPlus, Plus, Trash2 } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { Modal } from '@/components/modal'
import { PdfDropZone } from '@/components/pdf-drop-zone'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'
import type { ChecklistItemRow, DocumentRow, DrawingFile, DrawingFolder, Project, UpdateLog, UserRole, WorkflowStep } from '@/lib/types'
import { formatDate, formatDateTime, humanBytes, resolveUploadContentType, safeFileName } from '@/lib/utils'
import { detailStatusToDbStatus, getWorkflowDetailSpec, isWaitingDetailStatus } from '@/lib/workflow-detail-spec'

const DOCUMENT_TYPES = [
  ['customer', '客先資料'],
  ['specification', '仕様書'],
  ['flowsheet', 'フローシート'],
  ['estimate', '見積資料'],
  ['construction', '工事資料'],
  ['photo', '写真'],
  ['other', 'その他'],
] as const

function documentTypeLabel(value: string) {
  return DOCUMENT_TYPES.find(([key]) => key === value)?.[1] ?? value
}

function emptyStep(projectId: string, order: number): WorkflowStep {
  return {
    id: '', project_id: projectId, parent_step_id: null, step_code: null, title: '', display_order: order,
    status: '未着手', assignee_employee_id: null, current_ball_employee_id: null, current_ball_text: null,
    received_at: null, started_at: null, planned_at: null, completed_at: null,
    is_stage_marker: false, is_active: true, detail: {}, created_at: '', updated_at: '',
  }
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const { profile } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [checklistItems, setChecklistItems] = useState<ChecklistItemRow[]>([])
  const [drawingFolders, setDrawingFolders] = useState<DrawingFolder[]>([])
  const [drawingFiles, setDrawingFiles] = useState<DrawingFile[]>([])
  const [logs, setLogs] = useState<UpdateLog[]>([])
  const [tab, setTab] = useState<'workflow' | 'documents' | 'drawings' | 'history'>('workflow')
  const [stepModal, setStepModal] = useState(false)
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    setError('')
    try {
      const [projectRes, stepRes, documentRes, folderRes, logRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('workflow_steps').select('*').eq('project_id', projectId).eq('is_active', true).order('display_order'),
        supabase.from('documents').select('*').eq('project_id', projectId).eq('is_deleted', false).order('uploaded_at', { ascending: false }),
        supabase.from('drawing_folders').select('*').eq('project_id', projectId).eq('is_active', true).order('display_order'),
        supabase.from('update_logs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(200),
      ])
      if (projectRes.error) throw projectRes.error
      if (stepRes.error) throw stepRes.error
      if (documentRes.error) throw documentRes.error
      if (folderRes.error) throw folderRes.error
      if (logRes.error) throw logRes.error

      const stepRows = (stepRes.data ?? []) as WorkflowStep[]
      let checklistRows: ChecklistItemRow[] = []
      if (stepRows.length > 0) {
        const checklistRes = await supabase
          .from('checklist_items')
          .select('*')
          .in('workflow_step_id', stepRows.map((step) => step.id))
          .order('display_order')
        if (checklistRes.error) throw checklistRes.error
        checklistRows = (checklistRes.data ?? []) as ChecklistItemRow[]
      }

      const folders = (folderRes.data ?? []) as DrawingFolder[]
      let files: DrawingFile[] = []
      if (folders.length > 0) {
        const fileRes = await supabase
          .from('drawing_files')
          .select('*')
          .in('drawing_folder_id', folders.map((folder) => folder.id))
          .eq('is_deleted', false)
          .order('submitted_at', { ascending: false })
        if (fileRes.error) throw fileRes.error
        files = (fileRes.data ?? []) as DrawingFile[]
      }

      setProject(projectRes.data as Project)
      setSteps(stepRows)
      setChecklistItems(checklistRows)
      setDocuments((documentRes.data ?? []) as DocumentRow[])
      setDrawingFolders(folders)
      setDrawingFiles(files)
      setLogs((logRes.data ?? []) as UpdateLog[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [projectId])

  useEffect(() => { if (projectId) void load() }, [projectId, load])

  function openAddStep() {
    setEditingStep(emptyStep(projectId, steps.length + 1))
    setStepModal(true)
  }

  function openEditStep(step: WorkflowStep) {
    setEditingStep({ ...step, detail: { ...(step.detail ?? {}) } })
    setStepModal(true)
  }

  const completed = useMemo(() => steps.filter((step) => step.status.includes('完') || Boolean(step.completed_at)).length, [steps])
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0

  return (
    <AdminShell title={project?.display_name ?? '工事詳細'}>
      <div className="detail-header">
        <div className="detail-title">
          <Link className="back-link" href="/projects"><ArrowLeft size={20} /></Link>
          <div>
            <h2 style={{ margin: 0 }}>{project?.display_name ?? '読み込み中...'}</h2>
            <span className="muted">進捗 {completed}/{steps.length}（{progress}%）</span>
          </div>
        </div>
        <div style={{ minWidth: 240 }}><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>
      </div>

      <div className="tabs">
        <button className={`tab-button ${tab === 'workflow' ? 'active' : ''}`} onClick={() => setTab('workflow')}>工程管理</button>
        <button className={`tab-button ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>資料</button>
        <button className={`tab-button ${tab === 'drawings' ? 'active' : ''}`} onClick={() => setTab('drawings')}>図面</button>
        <button className={`tab-button ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>履歴</button>
      </div>

      {error && <div className="panel"><p className="error-text">{error}</p></div>}

      {tab === 'workflow' && (
        <WorkflowPanel
          project={project}
          projectId={projectId}
          profileId={profile?.id ?? ''}
          profileName={profile?.display_name ?? ''}
          steps={steps}
          onEdit={openEditStep}
          onAdd={openAddStep}
          onReload={load}
          onError={setError}
        />
      )}
      {tab === 'documents' && (
        <DocumentsPanel
          projectId={projectId}
          profileId={profile?.id ?? ''}
          steps={steps}
          documents={documents}
          onReload={load}
          onError={setError}
        />
      )}
      {tab === 'drawings' && (
        <DrawingsPanel
          projectId={projectId}
          profileId={profile?.id ?? ''}
          steps={steps}
          folders={drawingFolders}
          files={drawingFiles}
          onReload={load}
          onError={setError}
        />
      )}
      {tab === 'history' && <HistoryPanel logs={logs} />}

      <StepEditor
        key={editingStep?.id || `new-${editingStep?.display_order ?? 0}`}
        open={stepModal}
        step={editingStep}
        profileId={profile?.id ?? ''}
        profileName={profile?.display_name ?? ''}
        documents={documents}
        checklistItems={checklistItems}
        userRole={profile?.role ?? 'viewer'}
        onReload={load}
        onClose={() => setStepModal(false)}
        onSaved={async () => { setStepModal(false); await load() }}
        onError={setError}
      />
    </AdminShell>
  )
}

function WorkflowPanel({
  project, projectId, profileId, profileName, steps, onEdit, onAdd, onReload, onError,
}: {
  project: Project | null
  projectId: string
  profileId: string
  profileName: string
  steps: WorkflowStep[]
  onEdit: (step: WorkflowStep) => void
  onAdd: () => void
  onReload: () => Promise<void>
  onError: (value: string) => void
}) {
  async function remove(step: WorkflowStep) {
    if (!confirm(`「${step.title}」を削除しますか？`)) return
    const supabase = createClient()
    const result = await supabase.from('workflow_steps').update({ is_active: false, updated_by: profileId }).eq('id', step.id)
    if (result.error) return onError(result.error.message)
    await supabase.from('update_logs').insert({
      project_id: projectId, target_table: 'workflow_steps', target_id: step.id, action: 'delete', field_name: 'is_active',
      old_value: { is_active: true }, new_value: { is_active: false }, actor_employee_id: profileId, actor_name_snapshot: profileName,
    })
    await onReload()
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div><h2>工程一覧</h2><p>{project?.display_name} の工程をWebから編集</p></div>
        <button className="primary-button" onClick={onAdd}><Plus size={18} />工程追加</button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>No.</th><th>工程名</th><th>状態</th><th>担当</th><th>ボール持ち</th><th>予定日</th><th>完了日</th><th>操作</th></tr></thead>
          <tbody>
            {steps.map((step) => {
              const detail = (step.detail ?? {}) as Record<string, unknown>
              const displayStatus = String(detail.detail_status_label ?? step.status)
              return (
                <tr key={step.id}>
                  <td>{step.display_order}</td>
                  <td><strong>{step.title}</strong></td>
                  <td><span className={`badge ${step.status.includes('完') ? 'done' : step.status.includes('確認') ? 'wait' : step.status.includes('保留') ? 'hold' : 'work'}`}>{displayStatus}</span></td>
                  <td>{String(detail.assignee_name ?? '—')}</td>
                  <td>{step.current_ball_text ?? '—'}</td>
                  <td>{formatDate(step.planned_at)}</td>
                  <td>{formatDate(step.completed_at)}</td>
                  <td><div className="table-actions"><button className="icon-button" onClick={() => onEdit(step)}><Edit3 size={17} /></button><button className="icon-button danger" onClick={() => void remove(step)}><Trash2 size={17} /></button></div></td>
                </tr>
              )
            })}
            {steps.length === 0 && <tr><td colSpan={8}><div className="empty-state">工程データがありません。</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StepEditor({ open, step, profileId, profileName, documents, checklistItems, userRole, onReload, onClose, onSaved, onError }: {
  open: boolean
  step: WorkflowStep | null
  profileId: string
  profileName: string
  documents: DocumentRow[]
  checklistItems: ChecklistItemRow[]
  userRole: UserRole
  onReload: () => Promise<void>
  onClose: () => void
  onSaved: () => Promise<void>
  onError: (value: string) => void
}) {
  const [form, setForm] = useState<WorkflowStep | null>(() => step ? { ...step, detail: { ...(step.detail ?? {}) } } : null)
  const initialSpec = getWorkflowDetailSpec(step?.title ?? '')
  const [checklistDraft, setChecklistDraft] = useState<ChecklistItemRow[]>(() => {
    if (!step) return []
    const existing = checklistItems
      .filter((item) => item.workflow_step_id === step.id)
      .sort((a, b) => a.display_order - b.display_order)
      .map((item) => ({ ...item }))
    if (existing.length > 0 || !initialSpec.showChecklist) return existing
    return initialSpec.defaultChecklist.map((label, index) => ({
      id: `local-${index}-${label}`,
      workflow_step_id: step.id,
      label,
      is_checked: false,
      display_order: index,
      checked_by: null,
      checked_at: null,
    }))
  })
  const [newChecklistLabel, setNewChecklistLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [stepPdfFiles, setStepPdfFiles] = useState<File[]>([])
  const [stepPdfType, setStepPdfType] = useState('other')
  const [stepPdfVersion, setStepPdfVersion] = useState('初版')
  const [uploadingPdf, setUploadingPdf] = useState(false)

  if (!form) return null
  const detail = (form.detail ?? {}) as Record<string, unknown>
  const spec = getWorkflowDetailSpec(form.title)
  const rawDetailStatus = String(detail.detail_status_label ?? '').trim()
  const detailStatus = spec.statusOptions.includes(rawDetailStatus) ? rawDetailStatus : spec.statusOptions[0]
  const isWaiting = form.status === '確認待ち' || isWaitingDetailStatus(detailStatus)
  const linkedDocuments = documents.filter((document) => document.workflow_step_id === form.id)
  const canEditTitle = userRole === 'admin'

  function setDetailField(key: string, value: unknown) {
    setForm((current) => current ? { ...current, detail: { ...(current.detail ?? {}), [key]: value } } : current)
  }

  function updateDetailStatus(value: string) {
    setForm((current) => current ? {
      ...current,
      status: detailStatusToDbStatus(value, current.status),
      detail: { ...(current.detail ?? {}), detail_status_label: value },
    } : current)
  }

  function updateTitle(value: string) {
    const nextSpec = getWorkflowDetailSpec(value)
    setForm((current) => current ? {
      ...current,
      title: value,
      status: detailStatusToDbStatus(nextSpec.statusOptions[0], current.status),
      detail: { ...(current.detail ?? {}), detail_status_label: nextSpec.statusOptions[0] },
    } : current)
    if (checklistDraft.length === 0 && nextSpec.showChecklist) {
      setChecklistDraft(nextSpec.defaultChecklist.map((label, index) => ({
        id: `local-${Date.now()}-${index}`,
        workflow_step_id: step?.id ?? '',
        label,
        is_checked: false,
        display_order: index,
        checked_by: null,
        checked_at: null,
      })))
    }
  }

  function addChecklistItem() {
    const label = newChecklistLabel.trim()
    if (!label || checklistDraft.some((item) => item.label === label)) return
    setChecklistDraft((items) => [...items, {
      id: `local-${Date.now()}`,
      workflow_step_id: step?.id ?? '',
      label,
      is_checked: false,
      display_order: items.length,
      checked_by: null,
      checked_at: null,
    }])
    setNewChecklistLabel('')
  }

  async function uploadStepPdfs() {
    if (!form?.id) return onError('新しい工程は先に保存してください。保存後にPDFを追加できます。')
    const currentForm = form
    if (stepPdfFiles.length === 0) return onError('PDFファイルを追加してください。')
    setUploadingPdf(true)
    const supabase = createClient()
    try {
      for (const [index, file] of stepPdfFiles.entries()) {
        const storagePath = `${currentForm.project_id}/documents/${currentForm.id}/${Date.now()}_${index}_${safeFileName(file.name)}`
        const storage = await supabase.storage.from('project-files').upload(storagePath, file, {
          upsert: false,
          contentType: resolveUploadContentType(file.name, file.type),
        })
        if (storage.error) throw storage.error
        const insert = await supabase.from('documents').insert({
          project_id: currentForm.project_id,
          workflow_step_id: currentForm.id,
          document_type: stepPdfType,
          title: file.name.replace(/\.pdf$/i, ''),
          file_name: file.name,
          version_label: stepPdfVersion.trim() || '初版',
          storage_bucket: 'project-files',
          storage_path: storagePath,
          file_size_bytes: file.size,
          uploaded_by: profileId,
          note: `工程詳細「${currentForm.title}」から追加`,
        })
        if (insert.error) {
          await supabase.storage.from('project-files').remove([storagePath])
          throw insert.error
        }
      }
      setStepPdfFiles([])
      await onReload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUploadingPdf(false)
    }
  }

  async function openStepDocument(document: DocumentRow) {
    const supabase = createClient()
    const result = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 300)
    if (result.error) return onError(result.error.message)
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function removeStepDocument(document: DocumentRow) {
    if (!confirm(`「${document.file_name}」を削除しますか？`)) return
    const supabase = createClient()
    const update = await supabase.from('documents').update({ is_deleted: true }).eq('id', document.id)
    if (update.error) return onError(update.error.message)
    await supabase.storage.from(document.storage_bucket).remove([document.storage_path])
    await onReload()
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const currentForm = form
    if (!currentForm) return
    if (!currentForm.title.trim()) return onError('工程名を入力してください。')
    setBusy(true)
    const supabase = createClient()
    try {
      const currentDetail = (currentForm.detail ?? {}) as Record<string, unknown>
      const currentSpec = getWorkflowDetailSpec(currentForm.title)
      const rawStatus = String(currentDetail.detail_status_label ?? '').trim()
      const selectedStatus = currentSpec.statusOptions.includes(rawStatus) ? rawStatus : currentSpec.statusOptions[0]
      const dbStatus = detailStatusToDbStatus(selectedStatus, currentForm.status)
      const today = new Date().toISOString().slice(0, 10)
      const completedAt = dbStatus === '完了' ? (currentForm.completed_at || today) : (currentForm.completed_at || null)
      const detailPayload: Record<string, unknown> = {
        ...currentDetail,
        assignee_name: String(currentDetail.assignee_name ?? '').trim() || profileName,
        sender_name: String(currentDetail.sender_name ?? '').trim() || null,
        receiver_name: String(currentDetail.receiver_name ?? '').trim() || null,
        current_ball: currentForm.current_ball_text?.trim() || null,
        detail_status_label: selectedStatus,
        confirmation_target: String(currentDetail.confirmation_target ?? '').trim() || null,
        confirmation_content: String(currentDetail.confirmation_content ?? '').trim() || null,
        note: String(currentDetail.note ?? '').trim() || null,
        detail_content: String(currentDetail.detail_content ?? '').trim() || null,
      }
      const payload = {
        project_id: currentForm.project_id,
        parent_step_id: currentForm.parent_step_id,
        title: currentForm.title.trim(),
        display_order: Number(currentForm.display_order) || 1,
        status: dbStatus,
        current_ball_text: currentForm.current_ball_text?.trim() || null,
        received_at: currentForm.received_at || null,
        started_at: currentForm.started_at || null,
        planned_at: currentForm.planned_at || null,
        completed_at: completedAt,
        is_active: true,
        detail: detailPayload,
        updated_by: profileId,
      }

      let savedStepId = currentForm.id
      if (currentForm.id) {
        const result = await supabase.from('workflow_steps').update(payload).eq('id', currentForm.id)
        if (result.error) throw result.error
      } else {
        const result = await supabase.from('workflow_steps').insert({ ...payload, created_by: profileId }).select('id').single()
        if (result.error) throw result.error
        savedStepId = String(result.data.id)
      }

      await supabase.from('checklist_items').delete().eq('workflow_step_id', savedStepId)
      if (currentSpec.showChecklist && checklistDraft.length > 0) {
        const checklistResult = await supabase.from('checklist_items').insert(checklistDraft.map((item, index) => ({
          workflow_step_id: savedStepId,
          label: item.label,
          is_checked: item.is_checked,
          display_order: index,
          checked_by: item.is_checked ? profileId : null,
          checked_at: item.is_checked ? new Date().toISOString() : null,
          created_by: profileId,
          updated_by: profileId,
        })))
        if (checklistResult.error) throw checklistResult.error
      }

      await supabase.from('update_logs').insert({
        project_id: currentForm.project_id,
        target_table: 'workflow_steps',
        target_id: savedStepId,
        action: currentForm.id ? 'update' : 'insert',
        field_name: 'workflow_step_detail',
        new_value: payload,
        actor_employee_id: profileId,
        actor_name_snapshot: profileName,
      })
      await onSaved()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={form.id ? form.title : '工程追加'} onClose={onClose}>
      <form onSubmit={save}>
        {spec.completionOnly ? (
          <section className="workflow-detail-section">
            <div className="workflow-detail-section-header">
              <div><h3>完了確認</h3><p>完了状態と完了日だけを管理します。</p></div>
            </div>
            <div className="form-grid">
              <div className="form-field"><label>状態</label><select value={detailStatus} onChange={(e) => updateDetailStatus(e.target.value)}>{spec.statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
              <div className="form-field"><label>完了日</label><input type="date" value={form.completed_at ?? ''} onChange={(e) => setForm({ ...form, completed_at: e.target.value || null })} /></div>
            </div>
          </section>
        ) : (
          <>
            <section className="workflow-detail-section">
              <div className="workflow-detail-section-header">
                <div><h3>入力・選択内容</h3><p>{spec.summary}</p></div>
              </div>
              <div className="form-grid">
                <div className="form-field full"><label>工程名</label><input value={form.title} readOnly={!canEditTitle} onChange={(e) => updateTitle(e.target.value)} /></div>
                <div className="form-field"><label>状態</label><select value={detailStatus} onChange={(e) => updateDetailStatus(e.target.value)}>{spec.statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
                <div className="form-field"><label>{spec.roleLabel}</label><input value={String(detail.assignee_name ?? '')} onChange={(e) => setDetailField('assignee_name', e.target.value)} /></div>
                <div className="form-field full"><label>ボール持ち</label><input value={form.current_ball_text ?? ''} onChange={(e) => setForm({ ...form, current_ball_text: e.target.value })} placeholder={`社長 / 客先 / 工場 / 材料屋 / ${profileName}`} /></div>
                {spec.senderLabel && <div className="form-field"><label>{spec.senderLabel}</label><input value={String(detail.sender_name ?? '')} onChange={(e) => setDetailField('sender_name', e.target.value)} /></div>}
                {spec.receiverLabel && <div className="form-field"><label>{spec.receiverLabel}</label><input value={String(detail.receiver_name ?? '')} onChange={(e) => setDetailField('receiver_name', e.target.value)} /></div>}
                <div className="form-field"><label>{spec.dateLabel}</label><input type="date" value={(form[spec.dateField] as string | null) ?? ''} onChange={(e) => setForm({ ...form, [spec.dateField]: e.target.value || null })} /></div>
                <div className="form-field full"><label>備考</label><textarea value={String(detail.note ?? '')} onChange={(e) => setDetailField('note', e.target.value)} /></div>
              </div>
            </section>

            {isWaiting && (
              <section className="workflow-detail-section waiting">
                <div className="workflow-detail-section-header">
                  <div><h3>確認待ち情報</h3><p>確認先と確認内容を入力します。</p></div>
                </div>
                <div className="form-grid">
                  <div className="form-field"><label>確認先</label><input value={String(detail.confirmation_target ?? '')} onChange={(e) => setDetailField('confirmation_target', e.target.value)} placeholder="社長 / 客先 / 工場 / 材料屋" /></div>
                  <div className="form-field full"><label>確認内容</label><textarea value={String(detail.confirmation_content ?? '')} onChange={(e) => setDetailField('confirmation_content', e.target.value)} /></div>
                </div>
              </section>
            )}

            {spec.showChecklist && (
              <section className="workflow-detail-section checklist">
                <div className="workflow-detail-section-header">
                  <div><h3>{spec.checklistTitle}</h3><p>App Flutter と同じチェック項目を管理します。</p></div>
                </div>
                <div className="workflow-checklist-list">
                  {checklistDraft.map((item, index) => (
                    <label className="workflow-checklist-item" key={item.id}>
                      <input
                        type="checkbox"
                        checked={item.is_checked}
                        onChange={(e) => setChecklistDraft((items) => items.map((current, itemIndex) => itemIndex === index ? { ...current, is_checked: e.target.checked } : current))}
                      />
                      <CheckSquare size={18} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                  {checklistDraft.length === 0 && <div className="step-pdf-disabled-note">チェック項目がありません。</div>}
                </div>
                <div className="workflow-checklist-add">
                  <input value={newChecklistLabel} onChange={(e) => setNewChecklistLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }} placeholder="チェック項目名" />
                  <button type="button" className="soft-button" onClick={addChecklistItem}><Plus size={17} />項目追加</button>
                </div>
              </section>
            )}

            <section className="workflow-detail-section notes">
              <div className="workflow-detail-section-header">
                <div><h3>{spec.detailLabel}</h3><p>自由入力の詳細情報です。</p></div>
              </div>
              <div className="form-field full"><label>{spec.detailLabel}</label><textarea value={String(detail.detail_content ?? '')} onChange={(e) => setDetailField('detail_content', e.target.value)} /></div>
            </section>
          </>
        )}

        {!spec.completionOnly && (
          <section className="step-pdf-section">
            <div className="step-pdf-header">
              <div>
                <h3>工程PDF</h3>
                <p>この工程に関係するPDFをここから直接追加できます。</p>
              </div>
              {form.id && <span className="badge work">{linkedDocuments.length} ファイル</span>}
            </div>

            {!form.id ? (
              <div className="step-pdf-disabled-note">工程を先に保存すると、ここでPDFをドラッグ＆ドロップできます。</div>
            ) : (
              <>
                <div className="step-pdf-meta">
                  <div className="form-field"><label>資料種類</label><select value={stepPdfType} onChange={(e) => setStepPdfType(e.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  <div className="form-field"><label>版</label><input value={stepPdfVersion} onChange={(e) => setStepPdfVersion(e.target.value)} placeholder="初版 / Rev.1" /></div>
                </div>
                <PdfDropZone files={stepPdfFiles} onFiles={setStepPdfFiles} multiple disabled={uploadingPdf} title="この工程のPDFをここにドロップ" />
                <div className="step-pdf-upload-actions">
                  <button type="button" className="primary-button" disabled={uploadingPdf || stepPdfFiles.length === 0} onClick={() => void uploadStepPdfs()}>
                    <FileUp size={18} />{uploadingPdf ? 'アップロード中...' : `PDF追加${stepPdfFiles.length ? `（${stepPdfFiles.length}）` : ''}`}
                  </button>
                </div>

                {linkedDocuments.length > 0 && (
                  <div className="step-pdf-existing-list">
                    {linkedDocuments.map((document) => (
                      <div className="step-pdf-existing-item" key={document.id}>
                        <div>
                          <strong>{document.file_name}</strong>
                          <span>{documentTypeLabel(document.document_type)} · {document.version_label} · {humanBytes(document.file_size_bytes)}</span>
                        </div>
                        <div className="table-actions">
                          <button type="button" className="icon-button" onClick={() => void openStepDocument(document)}><Download size={16} /></button>
                          <button type="button" className="icon-button danger" onClick={() => void removeStepDocument(document)}><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={busy}>{busy ? '保存中...' : '保存'}</button></div>
      </form>
    </Modal>
  )
}


function DocumentsPanel({ projectId, profileId, steps, documents, onReload, onError }: {
  projectId: string
  profileId: string
  steps: WorkflowStep[]
  documents: DocumentRow[]
  onReload: () => Promise<void>
  onError: (value: string) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [workflowStepId, setWorkflowStepId] = useState('')
  const [documentType, setDocumentType] = useState('other')
  const [versionLabel, setVersionLabel] = useState('初版')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)

  const stepMap = useMemo(() => new Map(steps.map((step) => [step.id, step.title])), [steps])

  function resetForm() {
    setFile(null)
    setWorkflowStepId('')
    setDocumentType('other')
    setVersionLabel('初版')
    setTitle('')
    setNote('')
  }

  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!file) return onError('PDFファイルを選択してください。')
    setUploading(true)
    const supabase = createClient()
    try {
      const stepFolder = workflowStepId || 'common'
      const storagePath = `${projectId}/documents/${stepFolder}/${Date.now()}_${safeFileName(file.name)}`
      const storage = await supabase.storage.from('project-files').upload(storagePath, file, {
        upsert: false,
        contentType: resolveUploadContentType(file.name, file.type),
      })
      if (storage.error) throw storage.error
      const insert = await supabase.from('documents').insert({
        project_id: projectId,
        workflow_step_id: workflowStepId || null,
        document_type: documentType,
        title: title.trim() || file.name.replace(/\.pdf$/i, ''),
        file_name: file.name,
        version_label: versionLabel.trim() || '初版',
        storage_bucket: 'project-files',
        storage_path: storagePath,
        file_size_bytes: file.size,
        uploaded_by: profileId,
        note: note.trim() || null,
      })
      if (insert.error) {
        await supabase.storage.from('project-files').remove([storagePath])
        throw insert.error
      }
      setModalOpen(false)
      resetForm()
      await onReload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUploading(false)
    }
  }

  async function openDocument(document: DocumentRow) {
    const supabase = createClient()
    const result = await supabase.storage.from(document.storage_bucket).createSignedUrl(document.storage_path, 300)
    if (result.error) return onError(result.error.message)
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function remove(document: DocumentRow) {
    if (!confirm(`「${document.file_name}」を削除しますか？`)) return
    const supabase = createClient()
    const update = await supabase.from('documents').update({ is_deleted: true }).eq('id', document.id)
    if (update.error) return onError(update.error.message)
    await supabase.storage.from(document.storage_bucket).remove([document.storage_path])
    await onReload()
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div><h2>資料PDF</h2><p>資料を工程に紐付けてSupabase Storageへ保存します。</p></div>
          <button className="primary-button" onClick={() => setModalOpen(true)}><FileUp size={18} />資料追加</button>
        </div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>工程</th><th>種類</th><th>ファイル名</th><th>版</th><th>サイズ</th><th>登録日</th><th>操作</th></tr></thead><tbody>
          {documents.map((document) => <tr key={document.id}>
            <td><span className="badge work">{document.workflow_step_id ? (stepMap.get(document.workflow_step_id) ?? '不明工程') : '共通資料'}</span></td>
            <td>{documentTypeLabel(document.document_type)}</td>
            <td><strong>{document.file_name}</strong>{document.note && <div className="muted" style={{ marginTop: 4 }}>{document.note}</div>}</td>
            <td>{document.version_label}</td>
            <td>{humanBytes(document.file_size_bytes)}</td>
            <td>{formatDateTime(document.uploaded_at)}</td>
            <td><div className="table-actions"><button className="icon-button" onClick={() => void openDocument(document)}><Download size={17} /></button><button className="icon-button danger" onClick={() => void remove(document)}><Trash2 size={17} /></button></div></td>
          </tr>)}
          {documents.length === 0 && <tr><td colSpan={7}><div className="empty-state">資料がありません。</div></td></tr>}
        </tbody></table></div>
      </div>

      <Modal open={modalOpen} title="資料追加" onClose={() => { setModalOpen(false); resetForm() }}>
        <form onSubmit={upload}>
          <div className="form-grid">
            <div className="form-field full"><label>PDFファイル</label><PdfDropZone files={file ? [file] : []} onFiles={(files) => setFile(files[0] ?? null)} disabled={uploading} /></div>
            <div className="form-field"><label>関連工程</label><select value={workflowStepId} onChange={(e) => setWorkflowStepId(e.target.value)}><option value="">共通資料（工程指定なし）</option>{steps.map((step) => <option key={step.id} value={step.id}>{step.display_order}. {step.title}</option>)}</select></div>
            <div className="form-field"><label>資料種類</label><select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="form-field"><label>版</label><input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="初版 / Rev.1" /></div>
            <div className="form-field"><label>表示名</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="空欄ならファイル名を使用" /></div>
            <div className="form-field full"><label>備考</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <div className="form-actions"><button type="button" className="ghost-button" onClick={() => { setModalOpen(false); resetForm() }}>キャンセル</button><button className="primary-button" disabled={uploading}>{uploading ? 'アップロード中...' : '保存'}</button></div>
        </form>
      </Modal>
    </>
  )
}

function DrawingsPanel({ projectId, profileId, steps, folders, files, onReload, onError }: {
  projectId: string
  profileId: string
  steps: WorkflowStep[]
  folders: DrawingFolder[]
  files: DrawingFile[]
  onReload: () => Promise<void>
  onError: (value: string) => void
}) {
  const [folderModal, setFolderModal] = useState(false)
  const [uploadModal, setUploadModal] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderNote, setFolderNote] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [workflowStepId, setWorkflowStepId] = useState('')
  const [versionLabel, setVersionLabel] = useState('初版')
  const [fileNote, setFileNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const stepMap = useMemo(() => new Map(steps.map((step) => [step.id, step.title])), [steps])

  async function createFolder(event: FormEvent) {
    event.preventDefault()
    if (!folderName.trim()) return onError('フォルダ名を入力してください。')
    setBusy(true)
    const supabase = createClient()
    const result = await supabase.from('drawing_folders').insert({
      project_id: projectId,
      folder_name: folderName.trim(),
      display_order: folders.length + 1,
      note: folderNote.trim() || null,
      created_by: profileId,
      updated_by: profileId,
    })
    setBusy(false)
    if (result.error) return onError(result.error.message)
    setFolderName('')
    setFolderNote('')
    setFolderModal(false)
    await onReload()
  }

  function openUpload(folderId?: string) {
    setSelectedFolderId(folderId ?? folders[0]?.id ?? '')
    setWorkflowStepId('')
    setVersionLabel('初版')
    setFileNote('')
    setFile(null)
    setUploadModal(true)
  }

  async function uploadDrawing(event: FormEvent) {
    event.preventDefault()
    if (!selectedFolderId) return onError('図面フォルダを選択してください。')
    if (!file) return onError('図面PDFを選択してください。')
    setBusy(true)
    const supabase = createClient()
    try {
      const storagePath = `${projectId}/drawings/${selectedFolderId}/${Date.now()}_${safeFileName(file.name)}`
      const storage = await supabase.storage.from('project-files').upload(storagePath, file, {
        upsert: false,
        contentType: resolveUploadContentType(file.name, file.type),
      })
      if (storage.error) throw storage.error
      const insert = await supabase.from('drawing_files').insert({
        drawing_folder_id: selectedFolderId,
        workflow_step_id: workflowStepId || null,
        file_name: file.name,
        version_label: versionLabel.trim() || '初版',
        storage_bucket: 'project-files',
        storage_path: storagePath,
        submitted_by: profileId,
        note: fileNote.trim() || null,
      })
      if (insert.error) {
        await supabase.storage.from('project-files').remove([storagePath])
        throw insert.error
      }
      setUploadModal(false)
      await onReload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function openDrawing(drawing: DrawingFile) {
    const supabase = createClient()
    const result = await supabase.storage.from(drawing.storage_bucket).createSignedUrl(drawing.storage_path, 300)
    if (result.error) return onError(result.error.message)
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function removeDrawing(drawing: DrawingFile) {
    if (!confirm(`「${drawing.file_name}」を削除しますか？`)) return
    const supabase = createClient()
    const update = await supabase.from('drawing_files').update({ is_deleted: true }).eq('id', drawing.id)
    if (update.error) return onError(update.error.message)
    await supabase.storage.from(drawing.storage_bucket).remove([drawing.storage_path])
    await onReload()
  }

  async function removeFolder(folder: DrawingFolder) {
    const folderFiles = files.filter((item) => item.drawing_folder_id === folder.id)
    if (folderFiles.length > 0) return onError('図面が入っているフォルダは削除できません。先に図面を削除してください。')
    if (!confirm(`フォルダ「${folder.folder_name}」を削除しますか？`)) return
    const supabase = createClient()
    const result = await supabase.from('drawing_folders').update({ is_active: false, updated_by: profileId }).eq('id', folder.id)
    if (result.error) return onError(result.error.message)
    await onReload()
  }

  return (
    <>
      <div className="panel">
        <div className="panel-header">
          <div><h2>図面管理</h2><p>図面をフォルダ・工程・版で整理し、Supabase Storageで共有します。</p></div>
          <div className="table-actions">
            <button className="soft-button" onClick={() => setFolderModal(true)}><FolderPlus size={18} />フォルダ追加</button>
            <button className="primary-button" onClick={() => openUpload()} disabled={folders.length === 0}><FileUp size={18} />図面追加</button>
          </div>
        </div>

        {folders.length === 0 && <div className="empty-state">図面フォルダがありません。まず「フォルダ追加」で分類を作成してください。</div>}
        {folders.map((folder) => {
          const folderFiles = files.filter((item) => item.drawing_folder_id === folder.id)
          return (
            <div className="drawing-folder" key={folder.id}>
              <div className="drawing-folder-header">
                <div><h3>{folder.folder_name}</h3>{folder.note && <p>{folder.note}</p>}</div>
                <div className="table-actions"><button className="soft-button" onClick={() => openUpload(folder.id)}><Plus size={17} />図面追加</button><button className="icon-button danger" onClick={() => void removeFolder(folder)}><Trash2 size={17} /></button></div>
              </div>
              <div className="table-wrap"><table className="data-table"><thead><tr><th>工程</th><th>ファイル名</th><th>版</th><th>備考</th><th>登録日</th><th>操作</th></tr></thead><tbody>
                {folderFiles.map((drawing) => <tr key={drawing.id}>
                  <td><span className="badge work">{drawing.workflow_step_id ? (stepMap.get(drawing.workflow_step_id) ?? '不明工程') : '共通図面'}</span></td>
                  <td><strong>{drawing.file_name}</strong></td>
                  <td>{drawing.version_label}</td>
                  <td>{drawing.note ?? '—'}</td>
                  <td>{formatDateTime(drawing.submitted_at)}</td>
                  <td><div className="table-actions"><button className="icon-button" onClick={() => void openDrawing(drawing)}><Download size={17} /></button><button className="icon-button danger" onClick={() => void removeDrawing(drawing)}><Trash2 size={17} /></button></div></td>
                </tr>)}
                {folderFiles.length === 0 && <tr><td colSpan={6}><div className="empty-state">このフォルダに図面がありません。</div></td></tr>}
              </tbody></table></div>
            </div>
          )
        })}
      </div>

      <Modal open={folderModal} title="図面フォルダ追加" onClose={() => setFolderModal(false)}>
        <form onSubmit={createFolder}>
          <div className="form-grid">
            <div className="form-field full"><label>フォルダ名</label><input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="例：客先図 / 製作図 / 施工図" /></div>
            <div className="form-field full"><label>備考</label><textarea value={folderNote} onChange={(e) => setFolderNote(e.target.value)} /></div>
          </div>
          <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setFolderModal(false)}>キャンセル</button><button className="primary-button" disabled={busy}>{busy ? '保存中...' : '保存'}</button></div>
        </form>
      </Modal>

      <Modal open={uploadModal} title="図面追加" onClose={() => setUploadModal(false)}>
        <form onSubmit={uploadDrawing}>
          <div className="form-grid">
            <div className="form-field full"><label>図面PDF</label><PdfDropZone files={file ? [file] : []} onFiles={(files) => setFile(files[0] ?? null)} disabled={busy} title="図面PDFをここにドラッグ＆ドロップ" /></div>
            <div className="form-field"><label>図面フォルダ</label><select value={selectedFolderId} onChange={(e) => setSelectedFolderId(e.target.value)}><option value="">選択してください</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.folder_name}</option>)}</select></div>
            <div className="form-field"><label>関連工程</label><select value={workflowStepId} onChange={(e) => setWorkflowStepId(e.target.value)}><option value="">共通図面（工程指定なし）</option>{steps.map((step) => <option key={step.id} value={step.id}>{step.display_order}. {step.title}</option>)}</select></div>
            <div className="form-field"><label>版</label><input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="初版 / Rev.1" /></div>
            <div className="form-field"><label>備考</label><input value={fileNote} onChange={(e) => setFileNote(e.target.value)} /></div>
          </div>
          <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setUploadModal(false)}>キャンセル</button><button className="primary-button" disabled={busy}>{busy ? 'アップロード中...' : '保存'}</button></div>
        </form>
      </Modal>
    </>
  )
}

function HistoryPanel({ logs }: { logs: UpdateLog[] }) {
  return (
    <div className="panel">
      <div className="panel-header"><div><h2>更新履歴</h2><p>Supabase update_logs の監査履歴</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>日時</th><th>操作者</th><th>対象</th><th>操作</th><th>項目</th></tr></thead><tbody>
        {logs.map((log) => <tr key={log.id}><td>{formatDateTime(log.created_at)}</td><td>{log.actor_name_snapshot ?? '—'}</td><td>{log.target_table}</td><td>{log.action}</td><td>{log.field_name ?? '—'}</td></tr>)}
        {logs.length === 0 && <tr><td colSpan={5}><div className="empty-state">履歴がありません。</div></td></tr>}
      </tbody></table></div>
    </div>
  )
}
