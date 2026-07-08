'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { Modal } from '@/components/modal'
import { createClient } from '@/lib/supabase/client'
import type { Project, PurchaseOrder, PurchaseOrderLine } from '@/lib/types'
import { formatDate, formatDateTime } from '@/lib/utils'

type OrderWithMeta = PurchaseOrder & {
  projectName: string
  lines: PurchaseOrderLine[]
  totalQuantity: number
}

const statusLabels: Record<string, string> = {
  draft: '下書き',
  issued: '発注済み',
  cancelled: '取消',
}

function statusBadge(status: string) {
  if (status === 'issued') return 'done'
  if (status === 'cancelled') return 'hold'
  return 'wait'
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderWithMeta[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('すべて')
  const [selectedOrder, setSelectedOrder] = useState<OrderWithMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    try {
      const [orderResult, lineResult, projectResult] = await Promise.all([
        supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('purchase_order_lines').select('*').order('line_no'),
        supabase.from('projects').select('*').is('deleted_at', null),
      ])
      if (orderResult.error) throw orderResult.error
      if (lineResult.error) throw lineResult.error
      if (projectResult.error) throw projectResult.error

      const projectMap = new Map(((projectResult.data ?? []) as Project[]).map((project) => [project.id, project.display_name]))
      const allLines = (lineResult.data ?? []) as PurchaseOrderLine[]
      const next = ((orderResult.data ?? []) as PurchaseOrder[]).map((order) => {
        const lines = allLines.filter((line) => line.purchase_order_id === order.id)
        return {
          ...order,
          projectName: projectMap.get(order.project_id) ?? '削除済み工事',
          lines,
          totalQuantity: lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        }
      })
      setOrders(next)
      setSelectedOrder((current) => current ? (next.find((order) => order.id === current.id) ?? null) : null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({
    total: orders.length,
    issued: orders.filter((order) => order.status === 'issued').length,
    draft: orders.filter((order) => order.status === 'draft').length,
    cancelled: orders.filter((order) => order.status === 'cancelled').length,
  }), [orders])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return orders.filter((order) => {
      const statusOk = statusFilter === 'すべて' || order.status === statusFilter
      const text = [
        order.projectName,
        order.order_name,
        order.supplier_name_snapshot,
        order.ordered_by_name_snapshot,
        order.version_label,
        ...order.lines.flatMap((line) => [line.material_snapshot, line.item_name_snapshot, line.size_label_snapshot]),
      ].join(' ').toLowerCase()
      return statusOk && (!keyword || text.includes(keyword))
    })
  }, [orders, query, statusFilter])

  async function openPdf(order: OrderWithMeta) {
    if (!order.pdf_storage_bucket || !order.pdf_storage_path) return
    const supabase = createClient()
    const signed = await supabase.storage.from(order.pdf_storage_bucket).createSignedUrl(order.pdf_storage_path, 300)
    if (signed.error) {
      setError(signed.error.message)
      return
    }
    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <AdminShell title="発注履歴管理" subtitle="工事ごとの発注書と改訂履歴・明細を確認します">
      <div className="metric-grid history-metric-grid">
        <div className="metric-card"><span>発注履歴</span><strong>{counts.total}件</strong></div>
        <div className="metric-card"><span>発注済み</span><strong>{counts.issued}件</strong></div>
        <div className="metric-card"><span>下書き</span><strong>{counts.draft}件</strong></div>
        <div className="metric-card"><span>取消</span><strong>{counts.cancelled}件</strong></div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div><h2>発注履歴一覧</h2><p>発注書は上書きせず、版・改訂履歴として管理します。</p></div>
          <button className="soft-button" onClick={() => void load()}>再読込</button>
        </div>

        <div className="toolbar">
          <div className="search-box">
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="工事名・発注名・仕入先・材料を検索" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="compact-select">
            <option value="すべて">すべての状態</option>
            <option value="draft">下書き</option>
            <option value="issued">発注済み</option>
            <option value="cancelled">取消</option>
          </select>
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="table-wrap">
          <table className="data-table order-table">
            <thead>
              <tr><th>発注日</th><th>工事名</th><th>発注名</th><th>仕入先</th><th>発注者</th><th>版</th><th>状態</th><th>明細</th><th>数量計</th><th>更新日時</th><th>詳細</th></tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id}>
                  <td>{formatDate(order.order_date)}</td>
                  <td><strong>{order.projectName}</strong></td>
                  <td>{order.order_name}</td>
                  <td>{order.supplier_name_snapshot}</td>
                  <td>{order.ordered_by_name_snapshot}</td>
                  <td>{order.version_label}</td>
                  <td><span className={`badge ${statusBadge(order.status)}`}>{statusLabels[order.status] ?? order.status}</span></td>
                  <td>{order.lines.length}件</td>
                  <td>{order.totalQuantity.toLocaleString('ja-JP', { maximumFractionDigits: 3 })}</td>
                  <td>{formatDateTime(order.updated_at)}</td>
                  <td><button className="soft-button compact-action" onClick={() => setSelectedOrder(order)}>詳細</button></td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={11}><div className="empty-state">発注履歴がありません。</div></td></tr>}
              {loading && <tr><td colSpan={11}><div className="empty-state">読み込み中...</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={Boolean(selectedOrder)} title={selectedOrder ? `${selectedOrder.order_name} / ${selectedOrder.version_label}` : '発注詳細'} onClose={() => setSelectedOrder(null)}>
        {selectedOrder && (
          <div className="order-detail-stack">
            <div className="order-summary-grid">
              <div><span>工事</span><strong>{selectedOrder.projectName}</strong></div>
              <div><span>発注日</span><strong>{formatDate(selectedOrder.order_date)}</strong></div>
              <div><span>仕入先</span><strong>{selectedOrder.supplier_name_snapshot}</strong></div>
              <div><span>発注者</span><strong>{selectedOrder.ordered_by_name_snapshot}</strong></div>
              <div><span>版</span><strong>{selectedOrder.version_label}</strong></div>
              <div><span>状態</span><strong>{statusLabels[selectedOrder.status] ?? selectedOrder.status}</strong></div>
            </div>

            {selectedOrder.revision_reason && (
              <div className="info-strip"><strong>改訂理由：</strong>{selectedOrder.revision_reason}</div>
            )}

            {selectedOrder.pdf_storage_bucket && selectedOrder.pdf_storage_path && (
              <button className="soft-button order-pdf-button" onClick={() => void openPdf(selectedOrder)}>
                <FileText size={17} /> 発注書PDFを開く
              </button>
            )}

            <div className="table-wrap">
              <table className="data-table order-line-table">
                <thead><tr><th>No.</th><th>材質</th><th>品名</th><th>サイズ</th><th>数量</th><th>単位</th><th>備考</th></tr></thead>
                <tbody>
                  {selectedOrder.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.line_no}</td>
                      <td>{line.material_snapshot}</td>
                      <td><strong>{line.item_name_snapshot}</strong></td>
                      <td>{line.size_label_snapshot}</td>
                      <td>{Number(line.quantity).toLocaleString('ja-JP', { maximumFractionDigits: 3 })}</td>
                      <td>{line.unit_snapshot}</td>
                      <td>{line.note ?? '—'}</td>
                    </tr>
                  ))}
                  {selectedOrder.lines.length === 0 && <tr><td colSpan={7}><div className="empty-state">発注明細がありません。</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </AdminShell>
  )
}
