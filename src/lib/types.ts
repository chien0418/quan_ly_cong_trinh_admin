export type UserRole = 'admin' | 'editor' | 'viewer'

export type Employee = {
  id: string
  auth_user_id: string | null
  employee_code: string
  display_name: string
  role: UserRole
  preferred_language: string
  is_active: boolean
  must_change_password: boolean
  login_email: string | null
  created_at?: string
  updated_at?: string
}

export type Project = {
  id: string
  project_code: string | null
  display_name: string
  description: string | null
  status: string
  started_at: string | null
  planned_end_at: string | null
  completed_at: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type WorkflowStep = {
  id: string
  project_id: string
  parent_step_id: string | null
  step_code: string | null
  title: string
  display_order: number
  status: string
  assignee_employee_id: string | null
  current_ball_employee_id: string | null
  current_ball_text: string | null
  received_at: string | null
  started_at: string | null
  planned_at: string | null
  completed_at: string | null
  is_stage_marker: boolean
  is_active: boolean
  detail: Record<string, unknown>
  created_at: string
  updated_at: string
}


export type ChecklistItemRow = {
  id: string
  workflow_step_id: string
  label: string
  is_checked: boolean
  display_order: number
  checked_by: string | null
  checked_at: string | null
  created_by?: string | null
  updated_by?: string | null
}

export type DocumentRow = {
  id: string
  project_id: string
  workflow_step_id: string | null
  document_type: string
  title: string | null
  file_name: string
  version_label: string
  storage_bucket: string
  storage_path: string
  file_size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
  note: string | null
  is_deleted: boolean
}

export type UpdateLog = {
  id: string
  project_id: string | null
  target_table: string
  target_id: string | null
  action: string
  field_name: string | null
  old_value: unknown
  new_value: unknown
  actor_name_snapshot: string | null
  created_at: string
}

export type DrawingFolder = {
  id: string
  project_id: string
  folder_name: string
  display_order: number
  note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type DrawingFile = {
  id: string
  drawing_folder_id: string
  workflow_step_id: string | null
  file_name: string
  version_label: string
  storage_bucket: string
  storage_path: string
  submitted_by: string | null
  submitted_at: string
  note: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export type PurchaseOrder = {
  id: string
  project_id: string
  order_name: string
  supplier_id: string | null
  supplier_name_snapshot: string
  ordered_by: string | null
  ordered_by_name_snapshot: string
  order_date: string
  version_label: string
  revision_no: number
  revision_of: string | null
  revision_reason: string | null
  status: 'draft' | 'issued' | 'cancelled'
  pdf_storage_bucket: string | null
  pdf_storage_path: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type PurchaseOrderLine = {
  id: string
  purchase_order_id: string
  line_no: number
  material_item_id: string | null
  material_size_id: string | null
  material_snapshot: string
  item_name_snapshot: string
  size_label_snapshot: string
  quantity: number
  unit_snapshot: string
  note: string | null
  created_at: string
}

export type SupplierRow = {
  id: string
  project_id: string | null
  supplier_name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  note: string | null
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}


export type MaterialGroupRow = {
  id: string
  group_name: string
  note: string | null
  display_order: number
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type MaterialItemRow = {
  id: string
  group_id: string | null
  material: string
  item_name: string
  default_unit: string
  size_type: 'pipe' | 'bolt' | 'manual'
  note: string | null
  display_material: boolean
  display_item_name: boolean
  display_size: boolean
  display_unit: boolean
  display_note: boolean
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type MaterialSizeRow = {
  id: string
  material_item_id: string
  size_label: string
  pipe_size_a: number | null
  bolt_diameter: string | null
  bolt_length_mm: number | null
  sort_order: number
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type TakeoffFileRow = {
  id: string
  project_id: string
  file_name: string
  version_label: string
  storage_bucket: string
  storage_path: string
  submitted_by: string | null
  submitted_at: string
  note: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export type ScheduleEntry = {
  id: string
  project_id: string | null
  work_name: string
  work_content: string | null
  assignee_name: string | null
  start_date: string
  end_date: string
  start_time: string
  end_time: string
  schedule_scope: 'day' | 'week_month' | 'year'
  status: 'planned' | 'in_progress' | 'completed' | 'on_hold'
  color: string
  note: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ScheduleEntryEmployee = {
  schedule_entry_id: string
  employee_id: string
  is_primary: boolean
  position: number
}
