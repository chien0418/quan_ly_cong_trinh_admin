'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, FileSpreadsheet, FolderPlus, PackagePlus, Plus, RefreshCw, Save, Search, Store, Trash2 } from 'lucide-react'
import { AdminShell } from '@/components/admin-shell'
import { Modal } from '@/components/modal'
import { PdfDropZone } from '@/components/pdf-drop-zone'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import type {
  MaterialGroupRow,
  MaterialItemRow,
  MaterialSizeRow,
  Project,
  PurchaseOrder,
  PurchaseOrderLine,
  SupplierRow,
  TakeoffFileRow,
} from '@/lib/types'
import { formatDate, formatDateTime, safeFileName } from '@/lib/utils'

type SectionKey = 'takeoff' | 'create' | 'history' | 'suppliers' | 'materials'
type MaterialEditorState = {
  item: MaterialItemRow | null
  groupId: string
  material: string
  itemName: string
  unit: string
  sizeType: 'pipe' | 'bolt' | 'manual'
  note: string
  sizes: string[]
  displayMaterial: boolean
  displayItemName: boolean
  displaySize: boolean
  displayUnit: boolean
  displayNote: boolean
}
type OrderLineDraft = {
  key: string
  material: string
  materialItemId: string
  materialSizeId: string
  itemName: string
  sizeLabel: string
  quantity: string
  unit: string
  note: string
}
type OrderWithMeta = PurchaseOrder & { projectName: string; lines: PurchaseOrderLine[] }

const sections: { key: SectionKey; label: string; subtitle: string }[] = [
  { key: 'takeoff', label: '拾い集計', subtitle: '拾い出し・数量表ファイル' },
  { key: 'create', label: '注文書作成', subtitle: '横表で注文明細を作成' },
  { key: 'history', label: '注文履歴', subtitle: '作成済み注文書一覧' },
  { key: 'suppliers', label: '発注先管理', subtitle: '発注先マスター' },
  { key: 'materials', label: '品名・サイズ管理', subtitle: '品名・サイズ・単位マスター' },
]

const PIPE_SIZES = ['13A', '15A', '20A', '25A', '32A', '40A', '50A', '65A', '80A', '100A', '125A', '150A', '200A', '250A', '300A']
const PIPE_SMALL_SIZES = PIPE_SIZES.filter((size) => Number(size.replace('A', '')) <= 100)
const PIPE_LARGE_SIZES = PIPE_SIZES.filter((size) => Number(size.replace('A', '')) >= 125)
const BOLT_DIAMETERS = ['M6', 'M8', 'M10', 'M12', 'M16', 'M20', 'M22', 'M24', 'M30']
const ORDER_VERSIONS = ['初版', '修正1', '修正2', '修正3', '修正4', '修正5']

let lineKeySequence = 0

function createLineKey() {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(4)
    cryptoApi.getRandomValues(values)
    return `line-${Array.from(values, (value) => value.toString(36)).join('-')}`
  }

  lineKeySequence += 1
  return `line-${Date.now()}-${lineKeySequence}`
}

function emptyLine(): OrderLineDraft {
  return {
    key: createLineKey(),
    material: '',
    materialItemId: '',
    materialSizeId: '',
    itemName: '',
    sizeLabel: '',
    quantity: '',
    unit: '',
    note: '',
  }
}

function lineComplete(line: OrderLineDraft) {
  return Boolean(line.material && line.materialItemId && line.itemName && line.sizeLabel && Number(line.quantity) > 0 && line.unit)
}

function normalizeLines(lines: OrderLineDraft[]) {
  const filtered = lines.filter((line, index) => index === lines.length - 1 || lineComplete(line) || line.material || line.itemName || line.sizeLabel || line.quantity || line.note)
  if (filtered.length === 0 || lineComplete(filtered[filtered.length - 1])) filtered.push(emptyLine())
  return filtered
}

function todayIso() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export default function ProcurementPage() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'editor'
  const canAdmin = profile?.role === 'admin'
  const [section, setSection] = useState<SectionKey>('create')
  const [projects, setProjects] = useState<Project[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [materialGroups, setMaterialGroups] = useState<MaterialGroupRow[]>([])
  const [materialItems, setMaterialItems] = useState<MaterialItemRow[]>([])
  const [materialSizes, setMaterialSizes] = useState<MaterialSizeRow[]>([])
  const [orders, setOrders] = useState<OrderWithMeta[]>([])
  const [takeoffFiles, setTakeoffFiles] = useState<TakeoffFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [orderName, setOrderName] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [orderLines, setOrderLines] = useState<OrderLineDraft[]>([emptyLine()])

  const [supplierModal, setSupplierModal] = useState(false)
  const [supplierForm, setSupplierForm] = useState({ projectId: '', name: '', person: '', phone: '', email: '', note: '' })

  const [materialModal, setMaterialModal] = useState(false)
  const [materialModalMode, setMaterialModalMode] = useState<'create' | 'edit' | 'copy'>('create')
  const [materialForm, setMaterialForm] = useState<MaterialEditorState>({ item: null, groupId: '', material: '', itemName: '', unit: '', sizeType: 'manual', note: '', sizes: [], displayMaterial: true, displayItemName: true, displaySize: true, displayUnit: true, displayNote: false })
  const [groupModal, setGroupModal] = useState(false)
  const [groupForm, setGroupForm] = useState({ name: '', note: '' })
  const [manualSize, setManualSize] = useState('')
  const [manualBulkSizes, setManualBulkSizes] = useState('')
  const [selectedBoltDiameters, setSelectedBoltDiameters] = useState<string[]>(['M10'])
  const [boltLengthStart, setBoltLengthStart] = useState('30')
  const [boltLengthEnd, setBoltLengthEnd] = useState('100')
  const [boltLengthStep, setBoltLengthStep] = useState('10')

  const [takeoffProjectId, setTakeoffProjectId] = useState('')
  const [takeoffVersion, setTakeoffVersion] = useState('初版')
  const [takeoffNote, setTakeoffNote] = useState('')
  const [takeoffUploadFiles, setTakeoffUploadFiles] = useState<File[]>([])

  const [historyQuery, setHistoryQuery] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<OrderWithMeta | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const supabase = createClient()
    try {
      const [projectResult, supplierResult, groupResult, itemResult, sizeResult, orderResult, lineResult, takeoffResult] = await Promise.all([
        supabase.from('projects').select('*').is('deleted_at', null).order('created_at'),
        supabase.from('suppliers').select('*').order('supplier_name'),
        supabase.from('material_groups').select('*').eq('is_active', true).order('display_order').order('group_name'),
        supabase.from('material_items').select('*').order('material').order('item_name'),
        supabase.from('material_sizes').select('*').order('sort_order').order('size_label'),
        supabase.from('purchase_orders').select('*').order('order_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('purchase_order_lines').select('*').order('line_no'),
        supabase.from('takeoff_files').select('*').eq('is_deleted', false).order('submitted_at', { ascending: false }),
      ])
      for (const result of [projectResult, supplierResult, groupResult, itemResult, sizeResult, orderResult, lineResult, takeoffResult]) {
        if (result.error) throw result.error
      }

      const nextProjects = (projectResult.data ?? []) as Project[]
      const nextOrders = (orderResult.data ?? []) as PurchaseOrder[]
      const lines = (lineResult.data ?? []) as PurchaseOrderLine[]
      const projectMap = new Map(nextProjects.map((project) => [project.id, project.display_name]))
      setProjects(nextProjects)
      setSuppliers((supplierResult.data ?? []) as SupplierRow[])
      setMaterialGroups((groupResult.data ?? []) as MaterialGroupRow[])
      setMaterialItems((itemResult.data ?? []) as MaterialItemRow[])
      setMaterialSizes((sizeResult.data ?? []) as MaterialSizeRow[])
      setTakeoffFiles((takeoffResult.data ?? []) as TakeoffFileRow[])
      setOrders(nextOrders.map((order) => ({ ...order, projectName: projectMap.get(order.project_id) ?? '削除済み工事', lines: lines.filter((line) => line.purchase_order_id === order.id) })))
      if (!selectedProjectId && nextProjects.length > 0) setSelectedProjectId(nextProjects[0].id)
      if (!takeoffProjectId && nextProjects.length > 0) setTakeoffProjectId(nextProjects[0].id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId, takeoffProjectId])

  useEffect(() => { void load() }, [load])

  const activeMaterials = useMemo(() => materialItems.filter((item) => item.is_active), [materialItems])
  const activeSizes = useMemo(() => materialSizes.filter((size) => size.is_active), [materialSizes])
  const materialTypes = useMemo(() => [...new Set(activeMaterials.map((item) => item.material))].sort(), [activeMaterials])
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.display_name])), [projects])
  const supplierOptions = useMemo(() => suppliers.filter((supplier) => supplier.is_active && (supplier.project_id === null || supplier.project_id === selectedProjectId)), [suppliers, selectedProjectId])

  const activeGroups = useMemo(() => materialGroups.filter((group) => group.is_active), [materialGroups])
  const groupedMaterials = useMemo(() => activeGroups.map((group) => ({
    group,
    items: activeMaterials.filter((item) => item.group_id === group.id),
  })).filter((entry) => entry.items.length > 0), [activeGroups, activeMaterials])
  const ungroupedMaterials = useMemo(() => activeMaterials.filter((item) => !item.group_id || !activeGroups.some((group) => group.id === item.group_id)), [activeGroups, activeMaterials])

  function materialDisplayParts(item: MaterialItemRow, sizes: MaterialSizeRow[]) {
    const parts: string[] = []
    if (item.display_material) parts.push(item.material)
    if (item.display_item_name) parts.push(item.item_name)
    if (item.display_size && sizes.length === 1) parts.push(sizes[0].size_label)
    if (item.display_unit) parts.push(`単位:${item.default_unit}`)
    if (item.display_note && item.note) parts.push(item.note)
    return parts.length > 0 ? parts : [item.item_name]
  }


  function setMessage(nextSuccess = '', nextError = '') {
    setSuccess(nextSuccess)
    setError(nextError)
  }

  function updateLine(index: number, patch: Partial<OrderLineDraft>) {
    setOrderLines((current) => normalizeLines(current.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line)))
  }

  function changeMaterialType(index: number, material: string) {
    updateLine(index, { material, materialItemId: '', materialSizeId: '', itemName: '', sizeLabel: '', unit: '' })
  }

  function changeMaterialItem(index: number, itemId: string) {
    const item = activeMaterials.find((entry) => entry.id === itemId)
    if (!item) return
    const sizes = activeSizes.filter((size) => size.material_item_id === item.id)
    const only = sizes.length === 1 ? sizes[0] : null
    updateLine(index, {
      material: item.material,
      materialItemId: item.id,
      itemName: item.item_name,
      materialSizeId: only?.id ?? '',
      sizeLabel: only?.size_label ?? '',
      unit: item.default_unit,
    })
  }

  async function saveOrder() {
    if (!canEdit || saving || !profile) return
    setMessage()
    const supplier = suppliers.find((item) => item.id === selectedSupplierId)
    const completed = orderLines.filter(lineComplete)
    if (!selectedProjectId) return setMessage('', '工事を選択してください。')
    if (!orderName.trim()) return setMessage('', '注文名を入力してください。')
    if (!supplier) return setMessage('', '発注先を選択してください。')
    if (completed.length === 0) return setMessage('', '注文明細を1行以上入力してください。')

    setSaving(true)
    const supabase = createClient()
    try {
      const header = await supabase.from('purchase_orders').insert({
        project_id: selectedProjectId,
        order_name: orderName.trim(),
        supplier_id: supplier.id,
        supplier_name_snapshot: supplier.supplier_name,
        ordered_by: profile.id,
        ordered_by_name_snapshot: profile.display_name,
        order_date: todayIso(),
        version_label: '初版',
        revision_no: 0,
        status: 'draft',
        created_by: profile.id,
        updated_by: profile.id,
      }).select('*').single()
      if (header.error) throw header.error

      const lineInsert = await supabase.from('purchase_order_lines').insert(completed.map((line, index) => ({
        purchase_order_id: header.data.id,
        line_no: index + 1,
        material_item_id: line.materialItemId,
        material_size_id: line.materialSizeId || null,
        material_snapshot: line.material,
        item_name_snapshot: line.itemName,
        size_label_snapshot: line.sizeLabel,
        quantity: Number(line.quantity),
        unit_snapshot: line.unit,
        note: line.note.trim() || null,
      })))
      if (lineInsert.error) {
        await supabase.from('purchase_orders').delete().eq('id', header.data.id)
        throw lineInsert.error
      }
      await supabase.from('update_logs').insert({
        project_id: selectedProjectId,
        target_table: 'purchase_orders',
        target_id: header.data.id,
        action: 'insert',
        field_name: 'order_name',
        new_value: { order_name: orderName.trim(), supplier: supplier.supplier_name, line_count: completed.length },
        actor_employee_id: profile.id,
        actor_name_snapshot: profile.display_name,
      })

      setOrderName('')
      setSelectedSupplierId('')
      setOrderLines([emptyLine()])
      setSection('history')
      setMessage('注文書を保存しました。')
      await load()
    } catch (cause) {
      setMessage('', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function addSupplier() {
    if (!canEdit || !profile || !supplierForm.name.trim()) return
    setSaving(true)
    setMessage()
    const supabase = createClient()
    try {
      const result = await supabase.from('suppliers').insert({
        project_id: supplierForm.projectId || null,
        supplier_name: supplierForm.name.trim(),
        contact_person: supplierForm.person.trim() || null,
        phone: supplierForm.phone.trim() || null,
        email: supplierForm.email.trim() || null,
        note: supplierForm.note.trim() || null,
        created_by: profile.id,
        updated_by: profile.id,
      })
      if (result.error) throw result.error
      setSupplierModal(false)
      setSupplierForm({ projectId: '', name: '', person: '', phone: '', email: '', note: '' })
      setMessage('発注先を追加しました。')
      await load()
    } catch (cause) {
      setMessage('', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function deactivateSupplier(supplier: SupplierRow) {
    if (!canAdmin) return
    if (!window.confirm(`「${supplier.supplier_name}」を非表示にしますか？`)) return
    const supabase = createClient()
    const result = await supabase.from('suppliers').update({ is_active: false, updated_by: profile?.id ?? null }).eq('id', supplier.id)
    if (result.error) return setMessage('', result.error.message)
    setMessage('発注先を非表示にしました。')
    await load()
  }


  async function deleteMaterialItem(item: MaterialItemRow) {
    if (!canAdmin || !profile) return
    const label = [item.material, item.item_name].filter(Boolean).join(' / ')
    if (!window.confirm(`「${label}」を削除しますか？\n既存の注文履歴は保持されます。`)) return

    setSaving(true)
    setMessage()
    const supabase = createClient()
    try {
      // Soft-delete the material master instead of hard deleting it.
      // purchase_order_lines keeps foreign keys to material_items/material_sizes,
      // so physical deletion would break or be rejected for historical orders.
      const itemUpdate = await supabase
        .from('material_items')
        .update({ is_active: false, updated_by: profile.id })
        .eq('id', item.id)
      if (itemUpdate.error) throw itemUpdate.error

      const sizeUpdate = await supabase
        .from('material_sizes')
        .update({ is_active: false, updated_by: profile.id })
        .eq('material_item_id', item.id)
      if (sizeUpdate.error) throw sizeUpdate.error

      // Audit log failure should not roll back the successful soft delete.
      await supabase.from('update_logs').insert({
        project_id: null,
        target_table: 'material_items',
        target_id: item.id,
        action: 'update',
        field_name: 'is_active',
        old_value: { is_active: true, material: item.material, item_name: item.item_name },
        new_value: { is_active: false },
        actor_employee_id: profile.id,
        actor_name_snapshot: profile.display_name,
      })

      setMessage('物資を削除しました。既存の注文履歴は保持されています。')
      await load()
    } catch (cause) {
      setMessage('', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  function openMaterialModal(item?: MaterialItemRow, mode: 'create' | 'edit' | 'copy' = item ? 'edit' : 'create') {
    const sizes = item ? materialSizes.filter((size) => size.material_item_id === item.id && size.is_active).map((size) => size.size_label) : []
    setMaterialModalMode(mode)
    setMaterialForm({
      item: mode === 'edit' ? item ?? null : null,
      groupId: item?.group_id ?? '',
      material: item?.material ?? '',
      itemName: mode === 'copy' && item ? `${item.item_name} コピー` : item?.item_name ?? '',
      unit: item?.default_unit ?? '',
      sizeType: item?.size_type ?? 'manual',
      note: item?.note ?? '',
      sizes,
      displayMaterial: item?.display_material ?? true,
      displayItemName: item?.display_item_name ?? true,
      displaySize: item?.display_size ?? true,
      displayUnit: item?.display_unit ?? true,
      displayNote: item?.display_note ?? false,
    })
    setManualSize('')
    setManualBulkSizes('')
    setSelectedBoltDiameters(['M10'])
    setBoltLengthStart('30')
    setBoltLengthEnd('100')
    setBoltLengthStep('10')
    setMaterialModal(true)
  }

  async function createMaterialGroup() {
    if (!canAdmin || !profile || saving || !groupForm.name.trim()) return
    setSaving(true)
    setMessage()
    const supabase = createClient()
    try {
      const result = await supabase.from('material_groups').insert({
        group_name: groupForm.name.trim(),
        note: groupForm.note.trim() || null,
        display_order: materialGroups.length,
        created_by: profile.id,
        updated_by: profile.id,
      })
      if (result.error) throw result.error
      setGroupModal(false)
      setGroupForm({ name: '', note: '' })
      setMessage('物資グループを作成しました。')
      await load()
    } catch (cause) {
      setMessage('', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  function addSizeLabel(label: string) {
    addSizeLabels([label])
  }

  function addSizeLabels(labels: string[]) {
    const normalized = labels.map((label) => label.trim()).filter(Boolean)
    if (normalized.length === 0) return
    setMaterialForm((current) => ({
      ...current,
      sizes: [...new Set([...current.sizes, ...normalized])],
    }))
  }

  function replacePipeSizes(labels: string[]) {
    setMaterialForm((current) => ({ ...current, sizes: [...labels] }))
  }

  function toggleBoltDiameter(value: string) {
    setSelectedBoltDiameters((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  function buildBoltBulkSizes() {
    const start = Number(boltLengthStart)
    const end = Number(boltLengthEnd)
    const step = Number(boltLengthStep)
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || start <= 0 || end < start || step <= 0 || selectedBoltDiameters.length === 0) return []
    const lengths: number[] = []
    for (let value = start; value <= end && lengths.length < 200; value += step) lengths.push(value)
    return selectedBoltDiameters.flatMap((diameter) => lengths.map((length) => `${diameter}×${length}`))
  }

  function addManualBulkSizes() {
    const labels = manualBulkSizes
      .split(/\r?\n|,|;/)
      .map((value) => value.trim())
      .filter(Boolean)
    addSizeLabels(labels)
    setManualBulkSizes('')
  }

  async function saveMaterial() {
    if (!canAdmin || !profile || saving) return
    if (!materialForm.material.trim() || !materialForm.itemName.trim() || !materialForm.unit.trim() || materialForm.sizes.length === 0) {
      return setMessage('', '材質・品名・単位・サイズを入力してください。')
    }
    setSaving(true)
    setMessage()
    const supabase = createClient()
    try {
      let itemId = materialForm.item?.id
      if (itemId) {
        const update = await supabase.from('material_items').update({
          group_id: materialForm.groupId || null,
          material: materialForm.material.trim(),
          item_name: materialForm.itemName.trim(),
          default_unit: materialForm.unit.trim(),
          size_type: materialForm.sizeType,
          note: materialForm.note.trim() || null,
          display_material: materialForm.displayMaterial,
          display_item_name: materialForm.displayItemName,
          display_size: materialForm.displaySize,
          display_unit: materialForm.displayUnit,
          display_note: materialForm.displayNote,
          is_active: true,
          updated_by: profile.id,
        }).eq('id', itemId)
        if (update.error) throw update.error
      } else {
        const insert = await supabase.from('material_items').insert({
          group_id: materialForm.groupId || null,
          material: materialForm.material.trim(),
          item_name: materialForm.itemName.trim(),
          default_unit: materialForm.unit.trim(),
          size_type: materialForm.sizeType,
          note: materialForm.note.trim() || null,
          display_material: materialForm.displayMaterial,
          display_item_name: materialForm.displayItemName,
          display_size: materialForm.displaySize,
          display_unit: materialForm.displayUnit,
          display_note: materialForm.displayNote,
          created_by: profile.id,
          updated_by: profile.id,
        }).select('id').single()
        if (insert.error) throw insert.error
        itemId = insert.data.id
      }

      const existing = materialSizes.filter((size) => size.material_item_id === itemId)
      for (const row of existing) {
        const shouldActive = materialForm.sizes.includes(row.size_label)
        if (row.is_active !== shouldActive) {
          const update = await supabase.from('material_sizes').update({ is_active: shouldActive, updated_by: profile.id }).eq('id', row.id)
          if (update.error) throw update.error
        }
      }
      const existingLabels = new Set(existing.map((row) => row.size_label))
      const newLabels = materialForm.sizes.filter((label) => !existingLabels.has(label))
      if (newLabels.length > 0) {
        const insertSizes = await supabase.from('material_sizes').insert(newLabels.map((label, index) => ({
          material_item_id: itemId,
          size_label: label,
          pipe_size_a: materialForm.sizeType === 'pipe' ? Number(label.replace(/A$/i, '')) || null : null,
          bolt_diameter: materialForm.sizeType === 'bolt' ? label.split('×')[0] : null,
          bolt_length_mm: materialForm.sizeType === 'bolt' ? Number(label.split('×')[1]) || null : null,
          sort_order: existing.length + index,
          created_by: profile.id,
          updated_by: profile.id,
        })))
        if (insertSizes.error) throw insertSizes.error
      }
      setMaterialModal(false)
      setMessage(materialForm.item ? '物資マスターを更新しました。' : materialModalMode === 'copy' ? '物資をコピーして追加しました。' : '物資マスターを追加しました。')
      await load()
    } catch (cause) {
      setMessage('', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }



  async function uploadTakeoffFiles() {
    if (!canEdit || !profile || !takeoffProjectId || takeoffUploadFiles.length === 0) return
    setSaving(true)
    setMessage()
    const supabase = createClient()
    try {
      for (const file of takeoffUploadFiles) {
        const path = `${takeoffProjectId}/takeoff/${Date.now()}_${safeFileName(file.name)}`
        const upload = await supabase.storage.from('project-files').upload(path, file, { upsert: false, contentType: file.type || 'application/pdf' })
        if (upload.error) throw upload.error
        const insert = await supabase.from('takeoff_files').insert({
          project_id: takeoffProjectId,
          file_name: file.name,
          version_label: takeoffVersion,
          storage_bucket: 'project-files',
          storage_path: path,
          submitted_by: profile.id,
          note: takeoffNote.trim() || null,
        })
        if (insert.error) {
          await supabase.storage.from('project-files').remove([path])
          throw insert.error
        }
      }
      setTakeoffUploadFiles([])
      setTakeoffNote('')
      setMessage('拾い集計ファイルを登録しました。')
      await load()
    } catch (cause) {
      setMessage('', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  async function openStorageFile(bucket: string, path: string) {
    const signed = await createClient().storage.from(bucket).createSignedUrl(path, 300)
    if (signed.error) return setMessage('', signed.error.message)
    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const filteredHistory = useMemo(() => {
    const keyword = historyQuery.trim().toLowerCase()
    if (!keyword) return orders
    return orders.filter((order) => [order.projectName, order.order_name, order.supplier_name_snapshot, order.ordered_by_name_snapshot, ...order.lines.flatMap((line) => [line.material_snapshot, line.item_name_snapshot, line.size_label_snapshot])].join(' ').toLowerCase().includes(keyword))
  }, [orders, historyQuery])

  return (
    <AdminShell title="資材発注管理" subtitle="Flutterアプリと同じ発注ロジックで、拾い集計・注文作成・発注先・品名サイズを管理します">
      <div className="procurement-section-tabs">
        {sections.map((item) => (
          <button key={item.key} className={`procurement-tab ${section === item.key ? 'active' : ''}`} onClick={() => setSection(item.key)}>
            <strong>{item.label}</strong><span>{item.subtitle}</span>
          </button>
        ))}
      </div>

      {(error || success) && <div className={`procurement-message ${error ? 'error' : 'success'}`}>{error || success}</div>}

      {section === 'create' && (
        <>
          <div className="panel procurement-order-info">
            <div className="panel-header"><div><h2>注文情報</h2><p>工事・注文名・発注先を選択してから注文明細を入力します。</p></div><button className="soft-button" onClick={() => void load()}><RefreshCw size={16} />再読込</button></div>
            <div className="form-grid">
              <div className="form-field"><label>工事</label><select value={selectedProjectId} onChange={(event) => { setSelectedProjectId(event.target.value); setSelectedSupplierId('') }} disabled={!canEdit}>{projects.map((project) => <option key={project.id} value={project.id}>{project.display_name}</option>)}</select></div>
              <div className="form-field"><label>注文名</label><input value={orderName} onChange={(event) => setOrderName(event.target.value)} placeholder="例：1F RO配管材料" disabled={!canEdit} /></div>
              <div className="form-field"><label>発注先</label><select value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)} disabled={!canEdit}><option value="">発注先管理から選択</option>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></div>
              <div className="form-field"><label>注文者 / 注文日 / 版</label><div className="order-info-inline"><span>{profile?.display_name ?? '—'}</span><span>{todayIso()}</span><span>初版</span></div></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><div><h2>注文明細</h2><p>材質 → 品名 → サイズの順に選択します。完成行の下に次の空行が自動で追加されます。</p></div></div>
            <div className="table-wrap">
              <table className="data-table procurement-line-table">
                <thead><tr><th>No.</th><th>材質</th><th>品名</th><th>サイズ</th><th>数量</th><th>単位</th><th>備考</th></tr></thead>
                <tbody>
                  {orderLines.map((line, index) => {
                    const itemOptions = activeMaterials.filter((item) => item.material === line.material)
                    const sizeOptions = activeSizes.filter((size) => size.material_item_id === line.materialItemId)
                    return (
                      <tr key={line.key}>
                        <td>{index + 1}</td>
                        <td><select value={line.material} onChange={(event) => changeMaterialType(index, event.target.value)} disabled={!canEdit}><option value="">選択</option>{materialTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></td>
                        <td><select value={line.materialItemId} onChange={(event) => changeMaterialItem(index, event.target.value)} disabled={!canEdit || !line.material}><option value="">選択</option>{itemOptions.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}</select></td>
                        <td><select value={line.materialSizeId} onChange={(event) => { const size = sizeOptions.find((entry) => entry.id === event.target.value); updateLine(index, { materialSizeId: size?.id ?? '', sizeLabel: size?.size_label ?? '' }) }} disabled={!canEdit || !line.materialItemId}><option value="">選択</option>{sizeOptions.map((size) => <option key={size.id} value={size.id}>{size.size_label}</option>)}</select></td>
                        <td><input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} disabled={!canEdit} /></td>
                        <td><strong>{line.unit || '—'}</strong></td>
                        <td><input value={line.note} onChange={(event) => updateLine(index, { note: event.target.value })} disabled={!canEdit} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="form-actions"><button className="primary-button" onClick={() => void saveOrder()} disabled={!canEdit || saving}><Save size={17} />{saving ? '保存中...' : '保存'}</button></div>
          </div>
        </>
      )}

      {section === 'materials' && (
        <div className="panel">
          <div className="panel-header">
            <div><h2>品名・サイズ管理</h2><p>物資をグループ単位または単独行で管理します。表示項目は物資ごとに設定できます。</p></div>
            {canAdmin && <div className="material-header-actions"><button className="soft-button" onClick={() => setGroupModal(true)}><FolderPlus size={17} />グループ作成</button><button className="primary-button" onClick={() => openMaterialModal()}><PackagePlus size={17} />物資追加</button></div>}
          </div>

          <div className="material-group-list">
            {groupedMaterials.map(({ group, items }) => (
              <section className="material-group-section" key={group.id}>
                <div className="material-group-title"><div><strong>{group.group_name}</strong>{group.note && <span>{group.note}</span>}</div><span className="material-count-badge">{items.length}件</span></div>
                <div className="material-group-rows">
                  {items.map((item, index) => {
                    const sizes = activeSizes.filter((size) => size.material_item_id === item.id)
                    const parts = materialDisplayParts(item, sizes)
                    return <div className="material-list-row" key={item.id}>
                      <div className="material-row-index">{index + 1}.</div>
                      <div className="material-row-content">
                        <strong>{parts.join(' / ')}</strong>
                        {item.display_size && sizes.length > 1 && <div className="material-inline-sizes">{sizes.map((size) => <span key={size.id}>{size.size_label}</span>)}</div>}
                      </div>
                      {canAdmin && <div className="material-row-actions"><button className="soft-button compact-action" onClick={() => openMaterialModal(item, 'edit')}>編集</button><button className="soft-button compact-action" onClick={() => openMaterialModal(item, 'copy')}><Copy size={14} />コピー</button><button className="danger-button compact-action" onClick={() => void deleteMaterialItem(item)} disabled={saving}><Trash2 size={14} />削除</button></div>}
                    </div>
                  })}
                </div>
              </section>
            ))}

            {ungroupedMaterials.map((item) => {
              const sizes = activeSizes.filter((size) => size.material_item_id === item.id)
              const parts = materialDisplayParts(item, sizes)
              return <section className="material-standalone-row" key={item.id}>
                <div className="material-row-content">
                  <strong>{parts.join(' / ')}</strong>
                  {item.display_size && sizes.length > 1 && <div className="material-inline-sizes">{sizes.map((size) => <span key={size.id}>{size.size_label}</span>)}</div>}
                </div>
                {canAdmin && <div className="material-row-actions"><button className="soft-button compact-action" onClick={() => openMaterialModal(item, 'edit')}>編集</button><button className="soft-button compact-action" onClick={() => openMaterialModal(item, 'copy')}><Copy size={14} />コピー</button><button className="danger-button compact-action" onClick={() => void deleteMaterialItem(item)} disabled={saving}><Trash2 size={14} />削除</button></div>}
              </section>
            })}

            {!loading && activeMaterials.length === 0 && <div className="empty-state">物資マスターはまだ登録されていません。</div>}
          </div>
        </div>
      )}

      {section === 'suppliers' && (
        <div className="panel">
          <div className="panel-header"><div><h2>発注先管理</h2><p>登録した発注先は注文書作成で選択できます。</p></div>{canEdit && <button className="primary-button" onClick={() => setSupplierModal(true)}><Plus size={17} />発注先追加</button>}</div>
          <div className="supplier-grid">
            {suppliers.filter((supplier) => supplier.is_active).map((supplier) => <article className="supplier-card" key={supplier.id}>
              <div className="supplier-card-icon"><Store size={20} /></div><div><h3>{supplier.supplier_name}</h3><p>担当：{supplier.contact_person || '—'}</p><p>電話：{supplier.phone || '—'}</p><p>メール：{supplier.email || '—'}</p><small>{supplier.project_id ? `工事専用：${projectMap.get(supplier.project_id) ?? '—'}` : '会社共通'}</small>{supplier.note && <p>{supplier.note}</p>}</div>
              {canAdmin && <button className="icon-button danger" onClick={() => void deactivateSupplier(supplier)} aria-label="非表示"><Trash2 size={16} /></button>}
            </article>)}
            {!loading && suppliers.filter((supplier) => supplier.is_active).length === 0 && <div className="empty-state">発注先はまだ登録されていません。</div>}
          </div>
        </div>
      )}

      {section === 'history' && (
        <div className="panel">
          <div className="panel-header"><div><h2>注文履歴</h2><p>保存した注文書を版・改訂履歴として確認します。</p></div></div>
          <div className="toolbar"><div className="search-box"><Search size={18} /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="工事名・注文名・発注先・材料を検索" /></div></div>
          <div className="table-wrap"><table className="data-table order-table"><thead><tr><th>注文日</th><th>工事</th><th>注文名</th><th>発注先</th><th>注文者</th><th>版</th><th>状態</th><th>明細</th><th>詳細</th></tr></thead><tbody>{filteredHistory.map((order) => <tr key={order.id}><td>{formatDate(order.order_date)}</td><td>{order.projectName}</td><td><strong>{order.order_name}</strong></td><td>{order.supplier_name_snapshot}</td><td>{order.ordered_by_name_snapshot}</td><td>{order.version_label}</td><td>{order.status === 'issued' ? '発注済み' : order.status === 'cancelled' ? '取消' : '下書き'}</td><td>{order.lines.length}件</td><td><button className="soft-button compact-action" onClick={() => setSelectedOrder(order)}>詳細</button></td></tr>)}{!loading && filteredHistory.length === 0 && <tr><td colSpan={9}><div className="empty-state">注文履歴はまだありません。</div></td></tr>}</tbody></table></div>
        </div>
      )}

      {section === 'takeoff' && (
        <div className="panel">
          <div className="panel-header"><div><h2>拾い集計</h2><p>拾い出し・数量表ファイルを工事ごとに保存します。</p></div></div>
          <div className="form-grid procurement-upload-meta">
            <div className="form-field"><label>工事</label><select value={takeoffProjectId} onChange={(event) => setTakeoffProjectId(event.target.value)} disabled={!canEdit}>{projects.map((project) => <option key={project.id} value={project.id}>{project.display_name}</option>)}</select></div>
            <div className="form-field"><label>版</label><select value={takeoffVersion} onChange={(event) => setTakeoffVersion(event.target.value)} disabled={!canEdit}>{ORDER_VERSIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
            <div className="form-field full"><label>備考</label><input value={takeoffNote} onChange={(event) => setTakeoffNote(event.target.value)} disabled={!canEdit} /></div>
          </div>
          <PdfDropZone files={takeoffUploadFiles} onFiles={setTakeoffUploadFiles} multiple disabled={!canEdit || saving} title="拾い集計PDFをここにドラッグ＆ドロップ" />
          <div className="form-actions"><button className="primary-button" onClick={() => void uploadTakeoffFiles()} disabled={!canEdit || saving || takeoffUploadFiles.length === 0}><FileSpreadsheet size={17} />登録</button></div>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>工事</th><th>ファイル名</th><th>版</th><th>備考</th><th>登録日時</th><th>操作</th></tr></thead><tbody>{takeoffFiles.filter((file) => !takeoffProjectId || file.project_id === takeoffProjectId).map((file) => <tr key={file.id}><td>{projectMap.get(file.project_id) ?? '—'}</td><td><strong>{file.file_name}</strong></td><td>{file.version_label}</td><td>{file.note ?? '—'}</td><td>{formatDateTime(file.submitted_at)}</td><td><button className="soft-button compact-action" onClick={() => void openStorageFile(file.storage_bucket, file.storage_path)}>開く</button></td></tr>)}</tbody></table></div>
        </div>
      )}

      <Modal open={supplierModal} title="発注先追加" onClose={() => setSupplierModal(false)}>
        <div className="form-grid">
          <div className="form-field"><label>利用範囲</label><select value={supplierForm.projectId} onChange={(event) => setSupplierForm((current) => ({ ...current, projectId: event.target.value }))}><option value="">会社共通</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.display_name}</option>)}</select></div>
          <div className="form-field"><label>発注先名</label><input value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="form-field"><label>担当者</label><input value={supplierForm.person} onChange={(event) => setSupplierForm((current) => ({ ...current, person: event.target.value }))} /></div>
          <div className="form-field"><label>電話</label><input value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} /></div>
          <div className="form-field"><label>メール</label><input value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} /></div>
          <div className="form-field full"><label>備考</label><textarea value={supplierForm.note} onChange={(event) => setSupplierForm((current) => ({ ...current, note: event.target.value }))} /></div>
        </div>
        <div className="form-actions"><button className="ghost-button" onClick={() => setSupplierModal(false)}>キャンセル</button><button className="primary-button" onClick={() => void addSupplier()} disabled={saving}>追加</button></div>
      </Modal>

      <Modal open={groupModal} title="物資グループ作成" onClose={() => setGroupModal(false)}>
        <div className="form-grid">
          <div className="form-field full"><label>グループ名</label><input value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} placeholder="例：ボルト / 配管継手 / バルブ" /></div>
          <div className="form-field full"><label>備考</label><textarea value={groupForm.note} onChange={(event) => setGroupForm((current) => ({ ...current, note: event.target.value }))} /></div>
        </div>
        <div className="form-actions"><button className="ghost-button" onClick={() => setGroupModal(false)}>キャンセル</button><button className="primary-button" onClick={() => void createMaterialGroup()} disabled={saving || !groupForm.name.trim()}>作成</button></div>
      </Modal>

      <Modal open={materialModal} title={materialModalMode === 'edit' ? '物資編集' : materialModalMode === 'copy' ? '物資コピー' : '物資追加'} onClose={() => setMaterialModal(false)}>
        <div className="form-grid">
          <div className="form-field"><label>グループ</label><select value={materialForm.groupId} onChange={(event) => setMaterialForm((current) => ({ ...current, groupId: event.target.value }))}><option value="">グループなし</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.group_name}</option>)}</select></div>
          <div className="form-field"><label>材質</label><input value={materialForm.material} onChange={(event) => setMaterialForm((current) => ({ ...current, material: event.target.value }))} placeholder="例：SUS304 / SGP / ENBI" /></div>
          <div className="form-field"><label>品名</label><input value={materialForm.itemName} onChange={(event) => setMaterialForm((current) => ({ ...current, itemName: event.target.value }))} placeholder="例：エルボ / フランジ / ボルト" /></div>
          <div className="form-field"><label>単位</label><input value={materialForm.unit} onChange={(event) => setMaterialForm((current) => ({ ...current, unit: event.target.value }))} placeholder="個 / 本 / 枚 / セット" /></div>
          <div className="form-field"><label>サイズ種別</label><select value={materialForm.sizeType} onChange={(event) => setMaterialForm((current) => ({ ...current, sizeType: event.target.value as 'pipe' | 'bolt' | 'manual', sizes: [] }))}><option value="pipe">配管サイズ</option><option value="bolt">ボルトサイズ</option><option value="manual">手入力</option></select></div>
          <div className="form-field full"><label>サイズ追加</label>
            {materialForm.sizeType === 'pipe' && (
              <div className="bulk-size-panel">
                <div className="bulk-size-header">
                  <div><strong>配管サイズ一括追加</strong><span>エルボ・チーズ・フランジ・Uボルトなど、同じ呼び径系列をまとめて登録できます。</span></div>
                  <div className="bulk-size-actions">
                    <button type="button" className="soft-button" onClick={() => replacePipeSizes(PIPE_SIZES)}>13A〜300A 全選択</button>
                    <button type="button" className="soft-button" onClick={() => replacePipeSizes(PIPE_SMALL_SIZES)}>13A〜100A</button>
                    <button type="button" className="soft-button" onClick={() => replacePipeSizes(PIPE_LARGE_SIZES)}>125A〜300A</button>
                    <button type="button" className="ghost-button" onClick={() => replacePipeSizes([])}>選択解除</button>
                  </div>
                </div>
                <div className="material-size-picker">{PIPE_SIZES.map((size) => <button type="button" key={size} className={`chip ${materialForm.sizes.includes(size) ? 'active' : ''}`} onClick={() => materialForm.sizes.includes(size) ? setMaterialForm((current) => ({ ...current, sizes: current.sizes.filter((item) => item !== size) })) : addSizeLabel(size)}>{size}</button>)}</div>
                <div className="bulk-preview-line"><span>選択中</span><strong>{materialForm.sizes.length} サイズ</strong></div>
              </div>
            )}
            {materialForm.sizeType === 'bolt' && (
              <div className="bulk-size-panel">
                <div className="bulk-size-header"><div><strong>ボルトサイズ一括追加</strong><span>径を複数選択し、長さの開始・終了・間隔から組合せを自動生成します。</span></div></div>
                <div className="bolt-diameter-picker">{BOLT_DIAMETERS.map((value) => <button type="button" key={value} className={`chip ${selectedBoltDiameters.includes(value) ? 'active' : ''}`} onClick={() => toggleBoltDiameter(value)}>{value}</button>)}</div>
                <div className="bolt-range-builder">
                  <div><label>開始</label><input type="number" min="1" value={boltLengthStart} onChange={(event) => setBoltLengthStart(event.target.value)} /><span>mm</span></div>
                  <div><label>終了</label><input type="number" min="1" value={boltLengthEnd} onChange={(event) => setBoltLengthEnd(event.target.value)} /><span>mm</span></div>
                  <div><label>間隔</label><input type="number" min="1" value={boltLengthStep} onChange={(event) => setBoltLengthStep(event.target.value)} /><span>mm</span></div>
                  <button type="button" className="soft-button" onClick={() => { setBoltLengthStart('20'); setBoltLengthEnd('100'); setBoltLengthStep('10') }}>20〜100 / 10刻み</button>
                  <button type="button" className="primary-button" onClick={() => addSizeLabels(buildBoltBulkSizes())}>一括追加</button>
                </div>
                <div className="bulk-preview-line"><span>生成予定</span><strong>{buildBoltBulkSizes().length} サイズ</strong></div>
              </div>
            )}
            {materialForm.sizeType === 'manual' && (
              <div className="bulk-size-panel">
                <div className="workflow-checklist-add"><input value={manualSize} onChange={(event) => setManualSize(event.target.value)} placeholder="例：40×40×3 / 100A" /><button type="button" className="soft-button" onClick={() => { addSizeLabel(manualSize); setManualSize('') }}>1件追加</button></div>
                <label className="manual-bulk-label">複数サイズを一括貼り付け（1行1サイズ、カンマ区切りも可）</label>
                <textarea value={manualBulkSizes} onChange={(event) => setManualBulkSizes(event.target.value)} placeholder={'40×40×3\n50×50×4\n65×65×6'} />
                <div className="bulk-size-actions"><button type="button" className="soft-button" onClick={addManualBulkSizes}>一括追加</button></div>
              </div>
            )}
            <div className="material-size-summary"><strong>登録予定サイズ：{materialForm.sizes.length}件</strong><span>既存サイズと重複する値は自動的に除外されます。</span></div>
            <div className="material-size-chips editable">{materialForm.sizes.map((size) => <button type="button" key={size} onClick={() => setMaterialForm((current) => ({ ...current, sizes: current.sizes.filter((item) => item !== size) }))}>{size} ×</button>)}</div>
          </div>
          <div className="form-field full">
            <label>表示項目</label>
            <div className="material-display-options">
              <label><input type="checkbox" checked={materialForm.displayMaterial} onChange={(event) => setMaterialForm((current) => ({ ...current, displayMaterial: event.target.checked }))} />材質</label>
              <label><input type="checkbox" checked={materialForm.displayItemName} onChange={(event) => setMaterialForm((current) => ({ ...current, displayItemName: event.target.checked }))} />品名</label>
              <label><input type="checkbox" checked={materialForm.displaySize} onChange={(event) => setMaterialForm((current) => ({ ...current, displaySize: event.target.checked }))} />サイズ</label>
              <label><input type="checkbox" checked={materialForm.displayUnit} onChange={(event) => setMaterialForm((current) => ({ ...current, displayUnit: event.target.checked }))} />単位</label>
              <label><input type="checkbox" checked={materialForm.displayNote} onChange={(event) => setMaterialForm((current) => ({ ...current, displayNote: event.target.checked }))} />備考</label>
            </div>
            <small className="form-hint">チェックした内容だけを物資一覧に表示します。未チェック項目のデータは削除されません。</small>
          </div>
          <div className="form-field full"><label>備考</label><textarea value={materialForm.note} onChange={(event) => setMaterialForm((current) => ({ ...current, note: event.target.value }))} /></div>
        </div>
        <div className="form-actions"><button className="ghost-button" onClick={() => setMaterialModal(false)}>キャンセル</button><button className="primary-button" onClick={() => void saveMaterial()} disabled={saving}>保存</button></div>
      </Modal>

      <Modal open={Boolean(selectedOrder)} title={selectedOrder ? `${selectedOrder.order_name} / ${selectedOrder.version_label}` : '注文書詳細'} onClose={() => setSelectedOrder(null)}>
        {selectedOrder && <div className="order-detail-stack"><div className="order-summary-grid"><div><span>工事</span><strong>{selectedOrder.projectName}</strong></div><div><span>注文日</span><strong>{formatDate(selectedOrder.order_date)}</strong></div><div><span>発注先</span><strong>{selectedOrder.supplier_name_snapshot}</strong></div><div><span>注文者</span><strong>{selectedOrder.ordered_by_name_snapshot}</strong></div><div><span>版</span><strong>{selectedOrder.version_label}</strong></div><div><span>状態</span><strong>{selectedOrder.status === 'issued' ? '発注済み' : selectedOrder.status === 'cancelled' ? '取消' : '下書き'}</strong></div></div><div className="table-wrap"><table className="data-table order-line-table"><thead><tr><th>No.</th><th>材質</th><th>品名</th><th>サイズ</th><th>数量</th><th>単位</th><th>備考</th></tr></thead><tbody>{selectedOrder.lines.map((line) => <tr key={line.id}><td>{line.line_no}</td><td>{line.material_snapshot}</td><td>{line.item_name_snapshot}</td><td>{line.size_label_snapshot}</td><td>{line.quantity}</td><td>{line.unit_snapshot}</td><td>{line.note ?? '—'}</td></tr>)}</tbody></table></div></div>}
      </Modal>
    </AdminShell>
  )
}
