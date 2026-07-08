'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Edit3, KeyRound, Plus, Power, Search, ShieldCheck } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { RouteGuard } from '@/components/route-guard'
import { Modal } from '@/components/modal'
import { createClient } from '@/lib/supabase/client'
import type { Employee } from '@/lib/types'

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { void load() }, [])

  async function load() {
    const supabase = createClient()
    const result = await supabase.from('employees').select('*').order('employee_code')
    if (result.error) setError(result.error.message)
    else setEmployees((result.data ?? []) as Employee[])
  }

  async function rename(employee: Employee) {
    const value = prompt('新しい社員名', employee.display_name)?.trim()
    if (!value || value === employee.display_name) return
    const supabase = createClient()
    const result = await supabase.rpc('admin_update_employee_name', { p_employee_id: employee.id, p_display_name: value })
    if (result.error) return setError(result.error.message)
    setMessage('社員名を変更しました。')
    await load()
  }

  async function changeRole(employee: Employee) {
    const nextRole = employee.role === 'editor' ? 'viewer' : 'editor'
    if (!confirm(`${employee.display_name} を ${nextRole} に変更しますか？`)) return
    const supabase = createClient()
    const result = await supabase.rpc('admin_set_employee_role', { p_employee_id: employee.id, p_role: nextRole })
    if (result.error) return setError(result.error.message)
    setMessage('権限を変更しました。')
    await load()
  }

  async function toggleActive(employee: Employee) {
    const supabase = createClient()
    const rpcName = employee.is_active ? 'admin_deactivate_employee' : 'admin_reactivate_employee'
    const result = await supabase.rpc(rpcName, { p_employee_id: employee.id })
    if (result.error) return setError(result.error.message)
    setMessage(employee.is_active ? '利用停止にしました。' : '再有効化しました。')
    await load()
  }

  async function resetPin(employee: Employee) {
    if (!confirm(`${employee.display_name} のPINを0000へリセットしますか？`)) return
    const supabase = createClient()
    const result = await supabase.functions.invoke('admin-reset-password', {
      body: { employee_id: employee.id, temporary_password: '0000' },
    })
    if (result.error) return setError(result.error.message)
    setMessage('PINを0000へリセットしました。次回ログイン時に変更が必要です。')
    await load()
  }

  async function createEmployee(event: FormEvent) {
    event.preventDefault()
    if (!newCode.trim()) return setError('社員コードを入力してください。')
    setBusy(true)
    const supabase = createClient()
    try {
      const result = await supabase.functions.invoke('admin-create-employee', {
        body: { employee_code: newCode.trim().toUpperCase(), display_name: newName.trim() },
      })
      if (result.error) throw result.error
      setCreateOpen(false)
      setNewCode('')
      setNewName('')
      setMessage('社員を追加しました。初期PINは0000です。')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return employees
    return employees.filter((employee) => `${employee.employee_code} ${employee.display_name} ${employee.role}`.toLowerCase().includes(keyword))
  }, [employees, query])

  return (
    <RouteGuard roles={['admin']}>
      <AdminShell title="社員管理">
        <div className="panel">
          <div className="panel-header">
            <div><h2>社員一覧</h2><p>社員名、権限、利用状態、PINリセットを管理</p></div>
            <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={18} />社員追加</button>
          </div>
          <div className="toolbar"><div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="社員コード・氏名を検索" /></div></div>
          {error && <p className="error-text">{error}</p>}
          {message && <p className="success-text">{message}</p>}
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>社員コード</th><th>氏名</th><th>権限</th><th>状態</th><th>初期PIN変更</th><th>操作</th></tr></thead>
              <tbody>
                {filtered.map((employee) => (
                  <tr key={employee.id}>
                    <td><strong>{employee.employee_code}</strong></td>
                    <td>{employee.display_name}</td>
                    <td><span className={`badge ${employee.role === 'admin' ? 'done' : employee.role === 'editor' ? 'work' : 'off'}`}>{employee.role}</span></td>
                    <td><span className={`badge ${employee.is_active ? 'active' : 'off'}`}>{employee.is_active ? '利用中' : '停止中'}</span></td>
                    <td>{employee.must_change_password ? '必要' : '完了'}</td>
                    <td><div className="table-actions">
                      <button className="icon-button" title="氏名変更" onClick={() => void rename(employee)}><Edit3 size={17} /></button>
                      {employee.role !== 'admin' && <button className="icon-button" title="権限変更" onClick={() => void changeRole(employee)}><ShieldCheck size={17} /></button>}
                      <button className="icon-button" title="PINリセット" disabled={!employee.auth_user_id} onClick={() => void resetPin(employee)}><KeyRound size={17} /></button>
                      {employee.role !== 'admin' && <button className={`icon-button ${employee.is_active ? 'danger' : ''}`} title="利用停止/再開" onClick={() => void toggleActive(employee)}><Power size={17} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Modal open={createOpen} title="社員追加" onClose={() => setCreateOpen(false)}>
          <form onSubmit={createEmployee}>
            <div className="form-grid">
              <div className="form-field"><label>社員コード</label><input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="CS0100" /></div>
              <div className="form-field"><label>氏名</label><input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
              <div className="form-field full"><p className="muted">初期PINは0000。初回ログイン後に4桁PIN変更を必須にします。</p></div>
            </div>
            <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setCreateOpen(false)}>キャンセル</button><button className="primary-button" disabled={busy}>{busy ? '追加中...' : '追加'}</button></div>
          </form>
        </Modal>
      </AdminShell>
    </RouteGuard>
  )
}
