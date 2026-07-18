'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Plus, Printer, Trash2 } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { Modal } from '@/components/modal'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import type { Employee, Project, ScheduleEntry, ScheduleEntryEmployee } from '@/lib/types'

type ViewMode = 'day' | 'week' | 'month' | 'year'
type ScheduleEmployee = Pick<Employee, 'id' | 'employee_code' | 'display_name'>
type ScheduleForm = {
  id: string
  projectId: string
  workName: string
  workContent: string
  assigneeName: string
  selectedEmployeeIds: string[]
  primaryEmployeeId: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  status: ScheduleEntry['status']
  color: string
  note: string
}

const viewLabels: Record<ViewMode, string> = {
  day: '日',
  week: '週',
  month: '月',
  year: '年',
}

const tableTitles: Record<ViewMode, string> = {
  day: '日間工事表',
  week: '週間工事表',
  month: '月間工事表',
  year: '年間工事表',
}

const statusLabels: Record<ScheduleEntry['status'], string> = {
  planned: '予定',
  in_progress: '進行中',
  completed: '完了',
  on_hold: '保留',
}

const colorOptions = ['#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2']
const weekDayLabels = ['日', '月', '火', '水', '木', '金', '土']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const offset = (next.getDay() + 6) % 7
  next.setDate(next.getDate() - offset)
  return next
}

function daysBetween(start: Date, end: Date) {
  const result: Date[] = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) result.push(cursor)
  return result
}

function emptyForm(anchor: Date): ScheduleForm {
  const date = isoDate(anchor)
  return {
    id: '',
    projectId: '',
    workName: '',
    workContent: '',
    assigneeName: '',
    selectedEmployeeIds: [],
    primaryEmployeeId: '',
    startDate: date,
    endDate: date,
    startTime: '08:00',
    endTime: '17:00',
    status: 'planned',
    color: colorOptions[0],
    note: '',
  }
}

function getViewRange(mode: ViewMode, anchor: Date) {
  if (mode === 'day') return { start: new Date(anchor), end: new Date(anchor) }
  if (mode === 'week') {
    const start = startOfWeek(anchor)
    return { start, end: addDays(start, 13) }
  }
  if (mode === 'month') {
    return {
      start: new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12),
      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12),
    }
  }
  return {
    start: new Date(anchor.getFullYear(), 0, 1, 12),
    end: new Date(anchor.getFullYear(), 11, 31, 12),
  }
}

function moveAnchor(mode: ViewMode, anchor: Date, direction: number) {
  const next = new Date(anchor)
  if (mode === 'day') next.setDate(next.getDate() + direction)
  if (mode === 'week') next.setDate(next.getDate() + direction * 14)
  if (mode === 'month') next.setMonth(next.getMonth() + direction)
  if (mode === 'year') next.setFullYear(next.getFullYear() + direction)
  return next
}

function rangeLabel(mode: ViewMode, start: Date, end: Date) {
  if (mode === 'day') return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日（${weekDayLabels[start.getDay()]}）`
  if (mode === 'month') return `${start.getFullYear()}年${start.getMonth() + 1}月`
  if (mode === 'year') return `${start.getFullYear()}年`
  return `${start.getFullYear()}/${pad(start.getMonth() + 1)}/${pad(start.getDate())} - ${end.getFullYear()}/${pad(end.getMonth() + 1)}/${pad(end.getDate())}`
}

function scheduleScope(mode: ViewMode): ScheduleEntry['schedule_scope'] {
  if (mode === 'day') return 'day'
  if (mode === 'year') return 'year'
  return 'week_month'
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message
  return String(cause)
}

export default function SchedulePage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'editor'
  const [mode, setMode] = useState<ViewMode>('week')
  const [anchor, setAnchor] = useState(() => new Date())
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<ScheduleEmployee[]>([])
  const [entryEmployees, setEntryEmployees] = useState<Record<string, ScheduleEmployee[]>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(() => emptyForm(new Date()))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [preparedAt, setPreparedAt] = useState<Date | null>(null)

  const range = useMemo(() => getViewRange(mode, anchor), [mode, anchor])
  const rangeStart = isoDate(range.start)
  const rangeEnd = isoDate(range.end)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    try {
      const [entryResult, projectResult, employeeResult] = await Promise.all([
        supabase
          .from('schedule_entries')
          .select('*')
          .eq('schedule_scope', scheduleScope(mode))
          .lte('start_date', rangeEnd)
          .gte('end_date', rangeStart)
          .order('start_date')
          .order('created_at'),
        supabase.from('projects').select('*').is('deleted_at', null).order('display_name'),
        supabase.rpc('list_active_schedule_employees'),
      ])
      if (entryResult.error) throw entryResult.error
      if (projectResult.error) throw projectResult.error
      if (employeeResult.error) throw employeeResult.error
      const loadedEntries = (entryResult.data ?? []) as ScheduleEntry[]
      const loadedEmployees = (employeeResult.data ?? []) as ScheduleEmployee[]
      const assignmentMap: Record<string, ScheduleEmployee[]> = {}
      if (loadedEntries.length > 0) {
        const assignmentResult = await supabase
          .from('schedule_entry_employees')
          .select('schedule_entry_id, employee_id, is_primary, position')
          .in('schedule_entry_id', loadedEntries.map((entry) => entry.id))
          .order('is_primary', { ascending: false })
          .order('position')
        if (assignmentResult.error) throw assignmentResult.error
        const employeeById = new Map(loadedEmployees.map((employee) => [employee.id, employee]))
        for (const assignment of (assignmentResult.data ?? []) as ScheduleEntryEmployee[]) {
          const employee = employeeById.get(assignment.employee_id)
          if (!employee) continue
          if (!assignmentMap[assignment.schedule_entry_id]) assignmentMap[assignment.schedule_entry_id] = []
          assignmentMap[assignment.schedule_entry_id].push(employee)
        }
      }
      setEntries(loadedEntries)
      setProjects((projectResult.data ?? []) as Project[])
      setEmployees(loadedEmployees)
      setEntryEmployees(assignmentMap)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [mode, rangeEnd, rangeStart])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setPreparedAt(new Date()) }, [])

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return entries
    return entries.filter((entry) => `${entry.work_name} ${entry.work_content ?? ''} ${entry.assignee_name ?? ''} ${entry.note ?? ''}`.toLowerCase().includes(keyword))
  }, [entries, query])

  const filteredEmployees = useMemo(() => {
    const keyword = employeeQuery.trim().toLowerCase()
    if (!keyword) return employees
    return employees.filter((employee) => `${employee.employee_code} ${employee.display_name}`.toLowerCase().includes(keyword))
  }, [employeeQuery, employees])

  function openCreate() {
    setForm(emptyForm(anchor))
    setEmployeeQuery('')
    setModalOpen(true)
  }

  function openEdit(entry: ScheduleEntry) {
    const assignedEmployees = entryEmployees[entry.id] ?? []
    setForm({
      id: entry.id,
      projectId: entry.project_id ?? '',
      workName: entry.work_name,
      workContent: entry.work_content ?? '',
      assigneeName: entry.assignee_name ?? '',
      selectedEmployeeIds: assignedEmployees.map((employee) => employee.id),
      primaryEmployeeId: assignedEmployees[0]?.id ?? '',
      startDate: entry.start_date,
      endDate: entry.end_date,
      startTime: entry.start_time.slice(0, 5),
      endTime: entry.end_time.slice(0, 5),
      status: entry.status,
      color: entry.color,
      note: entry.note ?? '',
    })
    setEmployeeQuery('')
    setModalOpen(true)
  }

  function toggleEmployee(employeeId: string) {
    setForm((current) => {
      const selected = current.selectedEmployeeIds.includes(employeeId)
        ? current.selectedEmployeeIds.filter((id) => id !== employeeId)
        : [...current.selectedEmployeeIds, employeeId]
      const primaryEmployeeId = selected.includes(current.primaryEmployeeId)
        ? current.primaryEmployeeId
        : (selected[0] ?? '')
      return { ...current, selectedEmployeeIds: selected, primaryEmployeeId }
    })
  }

  function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId)
    setForm((current) => ({
      ...current,
      projectId,
      workName: project ? project.display_name : current.workName,
    }))
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!profile || !canEdit || saving) return
    if (!form.workName.trim()) return setError('工事名を入力してください。')
    if (!form.startDate || !form.endDate) return setError('開始日と終了日を入力してください。')
    if (form.endDate < form.startDate) return setError('終了日は開始日以降を指定してください。')
    if (form.startDate === form.endDate && form.endTime <= form.startTime) return setError('終了時刻は開始時刻より後に指定してください。')

    setSaving(true)
    setError('')
    const supabase = createClient()
    const primaryEmployee = employees.find((employee) => employee.id === form.primaryEmployeeId)
    const payload = {
      project_id: form.projectId || null,
      work_name: form.workName.trim(),
      work_content: form.workContent.trim() || null,
      assignee_name: primaryEmployee?.display_name ?? (form.assigneeName.trim() || null),
      start_date: form.startDate,
      end_date: form.endDate,
      start_time: form.startTime,
      end_time: form.endTime,
      schedule_scope: scheduleScope(mode),
      status: form.status,
      color: form.color,
      note: form.note.trim() || null,
      updated_by: profile.id,
    }

    try {
      const result = form.id
        ? await supabase.from('schedule_entries').update(payload).eq('id', form.id).select('id').single()
        : await supabase.from('schedule_entries').insert({ ...payload, created_by: profile.id }).select('id').single()
      if (result.error) throw result.error

      const removeAssignments = await supabase.from('schedule_entry_employees').delete().eq('schedule_entry_id', result.data.id)
      if (removeAssignments.error) throw removeAssignments.error
      if (form.selectedEmployeeIds.length > 0) {
        const assignmentResult = await supabase.from('schedule_entry_employees').insert(
          form.selectedEmployeeIds.map((employeeId, position) => ({
            schedule_entry_id: result.data.id,
            employee_id: employeeId,
            is_primary: employeeId === form.primaryEmployeeId,
            position,
          })),
        )
        if (assignmentResult.error) throw assignmentResult.error
      }

      await supabase.from('update_logs').insert({
        project_id: form.projectId || null,
        target_table: 'schedule_entries',
        target_id: result.data.id,
        action: form.id ? 'update' : 'insert',
        field_name: 'schedule',
        new_value: { ...payload, employee_ids: form.selectedEmployeeIds, primary_employee_id: form.primaryEmployeeId || null },
        actor_employee_id: profile.id,
        actor_name_snapshot: profile.display_name,
      })
      setModalOpen(false)
      await load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function remove(entry: ScheduleEntry) {
    if (!profile || !canEdit || !window.confirm(`「${entry.work_name}」を削除しますか？`)) return
    const supabase = createClient()
    const result = await supabase.from('schedule_entries').delete().eq('id', entry.id)
    if (result.error) return setError(result.error.message)
    await supabase.from('update_logs').insert({
      project_id: entry.project_id,
      target_table: 'schedule_entries',
      target_id: entry.id,
      action: 'delete',
      field_name: 'schedule',
      old_value: entry,
      actor_employee_id: profile.id,
      actor_name_snapshot: profile.display_name,
    })
    await load()
  }

  return (
    <AdminShell title="進捗スケジュール" subtitle="日・週・月・年で工事予定と進捗を管理します">
      <div className="schedule-toolbar panel">
        <div className="schedule-view-switch" aria-label="表示単位">
          {(Object.keys(viewLabels) as ViewMode[]).map((key) => (
            <button key={key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}>{viewLabels[key]}</button>
          ))}
        </div>

        <div className="schedule-period-nav">
          <button className="icon-button" onClick={() => setAnchor((current) => moveAnchor(mode, current, -1))} aria-label="前へ"><ChevronLeft size={20} /></button>
          <button className="soft-button" onClick={() => setAnchor(new Date())}>今日</button>
          <strong>{rangeLabel(mode, range.start, range.end)}</strong>
          <button className="icon-button" onClick={() => setAnchor((current) => moveAnchor(mode, current, 1))} aria-label="次へ"><ChevronRight size={20} /></button>
        </div>

        <div className="schedule-toolbar-actions">
          <input className="schedule-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="工事名・作業・担当・備考を検索" />
          <button className="soft-button schedule-print-button" onClick={() => window.print()}><Printer size={18} />PDF出力</button>
          {canEdit && <button className="primary-button" onClick={openCreate}><Plus size={18} />予定追加</button>}
        </div>
      </div>

      {error && <div className="panel"><p className="error-text">{error}</p></div>}

      <ScheduleBoard
        mode={mode}
        start={range.start}
        end={range.end}
        entries={filteredEntries}
        loading={loading}
        profileName={profile?.display_name ?? '—'}
        preparedAt={preparedAt}
        entryEmployees={entryEmployees}
        canEdit={canEdit}
        onEdit={openEdit}
        onRemove={(entry) => void remove(entry)}
      />

      <Modal open={modalOpen} title={form.id ? '予定編集' : '予定追加'} onClose={() => setModalOpen(false)}>
        <form className="modal-form" onSubmit={save}>
          <div className="form-field">
            <label>登録済み工事から選択（任意）</label>
            <select value={form.projectId} onChange={(event) => selectProject(event.target.value)}>
              <option value="">直接入力</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.display_name}</option>)}
            </select>
          </div>
          <div className="form-field"><label>工事名 *</label><input value={form.workName} onChange={(event) => setForm({ ...form, workName: event.target.value })} placeholder="例：〇〇工場 配管工事" /></div>
          <div className="form-field"><label>作業内容</label><input value={form.workContent} onChange={(event) => setForm({ ...form, workContent: event.target.value })} placeholder="例：冷蔵設備の据付・配管接続" /></div>
          <div className="form-field">
            <label>担当社員</label>
            <div className="schedule-employee-picker">
              <input value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="社員コード・氏名を検索" />
              <div className="schedule-employee-wheel" aria-label="担当社員を選択">
                <div className="schedule-wheel-spacer" aria-hidden="true" />
                {filteredEmployees.map((employee) => {
                    const selected = form.selectedEmployeeIds.includes(employee.id)
                    return (
                      <div className={`schedule-employee-option ${selected ? 'selected' : ''}`} key={employee.id}>
                        <button type="button" className="schedule-employee-toggle" onClick={() => toggleEmployee(employee.id)} aria-pressed={selected}>
                          <span className="schedule-wheel-check">{selected ? '✓' : ''}</span>
                          <span><strong>{employee.display_name}</strong><small>{employee.employee_code}</small></span>
                        </button>
                        {selected && <button type="button" className={`schedule-primary-assignee-button ${form.primaryEmployeeId === employee.id ? 'primary' : ''}`} onClick={() => setForm((current) => ({ ...current, primaryEmployeeId: employee.id }))}>{form.primaryEmployeeId === employee.id ? '主担当' : '主担当にする'}</button>}
                      </div>
                    )
                  })}
                {filteredEmployees.length === 0 && <p className="schedule-wheel-empty">該当する社員がいません。</p>}
                <div className="schedule-wheel-spacer" aria-hidden="true" />
              </div>
              <div className="schedule-employee-selection">選択中：<strong>{form.selectedEmployeeIds.length}名</strong>{form.primaryEmployeeId && <span>主担当：{employees.find((employee) => employee.id === form.primaryEmployeeId)?.display_name}</span>}</div>
            </div>
          </div>
          <div className="form-grid two">
            <div className="form-field"><label>開始日 *</label><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></div>
            <div className="form-field"><label>終了日 *</label><input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></div>
          </div>
          <div className="form-grid two">
            <div className="form-field"><label>開始時刻 *</label><input type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></div>
            <div className="form-field"><label>終了時刻 *</label><input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></div>
          </div>
          <div className="form-grid two">
            <div className="form-field"><label>状態</label><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ScheduleEntry['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="form-field"><label>表示色</label><div className="schedule-color-picker">{colorOptions.map((color) => <button type="button" key={color} className={form.color === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setForm({ ...form, color })} aria-label={color} />)}</div></div>
          </div>
          <div className="form-field"><label>備考</label><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} rows={4} /></div>
          <div className="modal-actions"><button type="button" className="soft-button" onClick={() => setModalOpen(false)}>キャンセル</button><button className="primary-button" type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</button></div>
        </form>
      </Modal>
    </AdminShell>
  )
}

function ScheduleBoard({ mode, start, end, entries, loading, profileName, preparedAt, entryEmployees, canEdit, onEdit, onRemove }: {
  mode: ViewMode
  start: Date
  end: Date
  entries: ScheduleEntry[]
  loading: boolean
  profileName: string
  preparedAt: Date | null
  entryEmployees: Record<string, ScheduleEmployee[]>
  canEdit: boolean
  onEdit: (entry: ScheduleEntry) => void
  onRemove: (entry: ScheduleEntry) => void
}) {
  const [visibleEmployees, setVisibleEmployees] = useState<ScheduleEmployee[] | null>(null)
  const dates = mode === 'day' || mode === 'year' ? [] : daysBetween(start, end)
  const columns = mode === 'day'
    ? Array.from({ length: 24 }, (_, hour) => ({ key: `hour-${hour}`, label: String(hour), subLabel: '時', weekend: false, isToday: false, nextWeek: false }))
    : mode === 'year'
      ? Array.from({ length: 12 }, (_, month) => ({ key: `month-${month}`, label: `${month + 1}`, subLabel: '月', weekend: false, isToday: false, nextWeek: false }))
      : dates.map((date, index) => ({
          key: isoDate(date),
          label: String(date.getDate()),
          subLabel: weekDayLabels[date.getDay()],
          weekend: date.getDay() === 0 || date.getDay() === 6,
          isToday: isoDate(date) === isoDate(new Date()),
          nextWeek: mode === 'week' && index >= 7,
        }))
  const template = `minmax(420px, 27%) repeat(${columns.length}, minmax(0, 1fr))`
  function timeMinutes(value: string) {
    const [hour, minute] = value.slice(0, 5).split(':').map(Number)
    return hour * 60 + minute
  }

  function position(entry: ScheduleEntry) {
    if (mode === 'day') {
      const selected = isoDate(start)
      const from = entry.start_date < selected ? 0 : Math.floor(timeMinutes(entry.start_time) / 60)
      const endHour = entry.end_date > selected ? 24 : Math.ceil(timeMinutes(entry.end_time) / 60)
      return { from: Math.max(0, Math.min(23, from)), to: Math.max(from, Math.min(23, endHour - 1)) }
    }
    if (mode === 'year') {
      const yearStart = `${start.getFullYear()}-01-01`
      const yearEnd = `${start.getFullYear()}-12-31`
      const from = entry.start_date < yearStart ? 0 : parseDate(entry.start_date).getMonth()
      const to = entry.end_date > yearEnd ? 11 : parseDate(entry.end_date).getMonth()
      return { from, to }
    }
    const rangeStart = parseDate(isoDate(start)).getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const from = Math.max(0, Math.round((parseDate(entry.start_date).getTime() - rangeStart) / dayMs))
    const to = Math.min(columns.length - 1, Math.round((parseDate(entry.end_date).getTime() - rangeStart) / dayMs))
    return { from, to }
  }

  return (
    <>
      <div className="panel schedule-panel">
      <div className="schedule-sheet-heading">
        <h2>{tableTitles[mode]}</h2>
        <div className="schedule-sheet-company">（株）カレントサービス</div>
        <div className="schedule-sheet-meta-wrap">
          <div className="schedule-sheet-meta">
            <div className="schedule-meta-column">
              <div className="schedule-meta-item"><span>開始日</span><strong>{isoDate(start).replaceAll('-', '/')}</strong></div>
              <div className="schedule-meta-item"><span>完了予定日</span><strong>{isoDate(end).replaceAll('-', '/')}</strong></div>
            </div>
            <div className="schedule-meta-column">
              <div className="schedule-meta-item"><span>作成日</span><strong>{preparedAt ? preparedAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</strong></div>
              <div className="schedule-meta-item"><span>作成者</span><strong>{profileName}</strong></div>
            </div>
          </div>
        </div>
      </div>
      <div className="schedule-sheet-subbar"><span><CalendarDays size={17} />{mode === 'week' ? '今週・来週の14日間' : mode === 'day' ? '24時間表示' : `${viewLabels[mode]}単位表示`}</span><strong>{entries.length}件</strong></div>
      <div className="schedule-board-scroll">
        <div className={`schedule-board ${columns.length >= 24 ? 'dense' : ''}`} style={{ gridTemplateColumns: template }}>
          <div className="schedule-head schedule-meta-head"><span>工事名</span><span>作業</span><span>担当</span><span>{mode === 'day' ? '開始' : '開始日'}</span><span>{mode === 'day' ? '終了' : '終了日'}</span><span>備考</span><span>{canEdit ? '操作' : ''}</span></div>
          {columns.map((column) => <div key={column.key} className={`schedule-head ${column.weekend ? 'weekend' : ''} ${column.isToday ? 'today' : ''} ${column.nextWeek ? 'next-week' : ''}`}><strong>{column.label}</strong><small>{column.subLabel}</small></div>)}

          {entries.map((entry) => {
            const { from, to } = position(entry)
            const assignedEmployees = entryEmployees[entry.id] ?? []
            return (
              <div className="schedule-row" style={{ gridTemplateColumns: template }} key={entry.id}>
                <div className="schedule-meta-cell">
                  <div className="schedule-meta-work"><strong>{entry.work_name}</strong><span className={`badge ${entry.status === 'completed' ? 'done' : entry.status === 'on_hold' ? 'hold' : entry.status === 'planned' ? 'wait' : 'work'}`}>{statusLabels[entry.status]}</span></div>
                  <span className="schedule-work-content" title={entry.work_content ?? ''}>{entry.work_content || '—'}</span>
                  {assignedEmployees.length > 1 ? (
                    <div className="schedule-assignee-compact">
                      <span>{assignedEmployees[0].display_name}</span>
                      <button type="button" onClick={() => setVisibleEmployees(assignedEmployees)} aria-label={`${entry.work_name}の担当社員一覧`}>+{assignedEmployees.length - 1}</button>
                    </div>
                  ) : <span>{assignedEmployees[0]?.display_name || entry.assignee_name || '—'}</span>}
                  {mode === 'day' ? <span>{entry.start_time.slice(0, 5)}</span> : <span>{entry.start_date.slice(5).replace('-', '/')}<small>{entry.start_time.slice(0, 5)}</small></span>}
                  {mode === 'day' ? <span>{entry.end_time.slice(0, 5)}</span> : <span>{entry.end_date.slice(5).replace('-', '/')}<small>{entry.end_time.slice(0, 5)}</small></span>}
                  <span title={entry.note ?? ''}>{entry.note || '—'}</span>
                  <div className="schedule-row-actions">{canEdit && <><button className="icon-button" onClick={() => onEdit(entry)} aria-label="編集"><Edit3 size={15} /></button><button className="icon-button danger" onClick={() => onRemove(entry)} aria-label="削除"><Trash2 size={15} /></button></>}</div>
                </div>
                {columns.map((column, index) => <div key={`${entry.id}-${column.key}`} className={`schedule-grid-cell ${column.weekend ? 'weekend' : ''} ${column.isToday ? 'today' : ''}`} style={{ gridColumn: index + 2 }} />)}
                <button className={`schedule-bar ${canEdit ? '' : 'read-only'}`} style={{ gridColumn: `${from + 2} / ${to + 3}`, backgroundColor: entry.color }} onClick={canEdit ? () => onEdit(entry) : undefined} disabled={!canEdit} title={`${entry.work_name}: ${entry.start_date} ${entry.start_time.slice(0, 5)} - ${entry.end_date} ${entry.end_time.slice(0, 5)}`}><span>{entry.work_name}</span></button>
              </div>
            )
          })}
        </div>
        {!loading && entries.length === 0 && <div className="empty-state schedule-empty">この期間の予定はありません。「予定追加」から登録できます。</div>}
        {loading && <div className="empty-state schedule-empty">読み込み中...</div>}
      </div>
      </div>
      <Modal open={visibleEmployees !== null} title="担当社員一覧" onClose={() => setVisibleEmployees(null)}>
        <div className="schedule-assignee-modal-list">
          {(visibleEmployees ?? []).map((employee, index) => (
            <div key={employee.id}>
              <span><strong>{employee.display_name}</strong><small>{employee.employee_code}</small></span>
              {index === 0 && <b>主担当</b>}
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
