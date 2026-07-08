export type WorkflowDateField = 'received_at' | 'started_at' | 'planned_at' | 'completed_at'

export type WorkflowDetailSpec = {
  title: string
  summary: string
  roleLabel: string
  dateLabel: string
  dateField: WorkflowDateField
  statusOptions: string[]
  checklistTitle: string
  defaultChecklist: string[]
  senderLabel?: string
  receiverLabel?: string
  detailLabel: string
  showChecklist: boolean
  completionOnly?: boolean
}

const DEFAULT_SPEC: WorkflowDetailSpec = {
  title: '追加工程',
  summary: '追加された工程です。必要な項目を入力してください。',
  roleLabel: '担当',
  dateLabel: '予定日',
  dateField: 'planned_at',
  statusOptions: ['未着手', '作業中', '確認待ち', '修正中', '完了'],
  checklistTitle: '確認項目',
  defaultChecklist: ['確認内容', '添付資料', 'その他'],
  detailLabel: '詳細内容・備考',
  showChecklist: true,
}

const SPECS: Record<string, WorkflowDetailSpec> = {
  'データ受領': {
    title: 'データ受領',
    summary: '受領したデータと資料の確認状況を管理します。',
    roleLabel: '受領者',
    senderLabel: '送信者',
    dateLabel: '受領日',
    dateField: 'received_at',
    statusOptions: ['未受領', '確認中', '確認完了', '確認待ち'],
    checklistTitle: '受領資料',
    defaultChecklist: ['レブロデータ', '機器配置図', 'フロー図', '技術資料', 'その他'],
    detailLabel: '備考・受領内容',
    showChecklist: true,
  },
  '3D・フロー図確認': {
    title: '3D・フロー図確認',
    summary: '3Dモデルとフロー図の整合・取り合いを確認します。',
    roleLabel: '確認者',
    dateLabel: '完了日',
    dateField: 'completed_at',
    statusOptions: ['確認中', '確認待ち', '確認完了', '修正中'],
    checklistTitle: '確認項目',
    defaultChecklist: ['3Dモデル', 'フロー図', '取り合い', '機器位置', 'その他'],
    detailLabel: '確認内容・備考',
    showChecklist: true,
  },
  '拾い集計': {
    title: '拾い集計',
    summary: '見積り前に必要な3D図・数量表・見積用資料をまとめます。',
    roleLabel: '担当',
    dateLabel: '完了日',
    dateField: 'completed_at',
    statusOptions: ['未着手', '3D作成中', '拾い出し中', '確認待ち', '完了'],
    checklistTitle: '作成資料',
    defaultChecklist: ['3D図', '配管数量表', '鋼材数量表', '見積用資料', 'その他'],
    detailLabel: '備考・集計内容',
    showChecklist: true,
  },
  '見積り': {
    title: '見積り',
    summary: '見積りの提出・承認・製作準備の状況を管理します。',
    roleLabel: '担当',
    dateLabel: '提出日',
    dateField: 'planned_at',
    statusOptions: ['未提出', '提出済み', '承認待ち', '確認待ち', '承認済み', '製作準備'],
    checklistTitle: '確認項目',
    defaultChecklist: [],
    detailLabel: '備考',
    showChecklist: false,
  },
  '図面作図': {
    title: '図面作図',
    summary: '製作・施工に必要な図面の作成状況を管理します。',
    roleLabel: '担当',
    dateLabel: '通知日',
    dateField: 'planned_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '修正中', '完了'],
    checklistTitle: '作成図面',
    defaultChecklist: ['配管製作図', '架台製作図', '電気図', '機器配置図', 'アンカー図', '搬入図', '施工図', 'その他'],
    detailLabel: '備考・図面内容',
    showChecklist: true,
  },
  '詳細拾い出し': {
    title: '詳細拾い出し',
    summary: '発注・製作に使う詳細数量表を作成します。',
    roleLabel: '担当',
    dateLabel: '通知日',
    dateField: 'planned_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '修正中', '完了'],
    checklistTitle: '数量表',
    defaultChecklist: ['ボルト数量', 'パッキン数量', 'Uバンド数量', 'その他'],
    detailLabel: '備考・拾い出し内容',
    showChecklist: true,
  },
  '工場製作': {
    title: '工場製作',
    summary: '工場側の製作状況と製作用図面を管理します。',
    roleLabel: '担当',
    dateLabel: '通知日',
    dateField: 'planned_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '修正中', '完了'],
    checklistTitle: '作成図面',
    defaultChecklist: ['配管製作図', '架台製作図', '電気図', 'その他'],
    detailLabel: '備考・製作内容',
    showChecklist: true,
  },
  '搬入': {
    title: '搬入',
    summary: '現場への搬入・据付前準備を管理します。',
    roleLabel: '担当',
    dateLabel: '開始日',
    dateField: 'started_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '完了'],
    checklistTitle: '作業内容',
    defaultChecklist: ['墨出し', '機器搬入', '機器固定', 'その他'],
    detailLabel: '作業内容・備考',
    showChecklist: true,
  },
  '架台据付': {
    title: '架台据付',
    summary: '架台据付の作業状況を管理します。',
    roleLabel: '担当',
    dateLabel: '開始日',
    dateField: 'started_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '完了'],
    checklistTitle: '作業内容',
    defaultChecklist: ['墨出し', '架台据付', 'その他'],
    detailLabel: '作業内容・備考',
    showChecklist: true,
  },
  '配管据付': {
    title: '配管据付',
    summary: '配管搬入・配管据付の作業状況を管理します。',
    roleLabel: '担当',
    dateLabel: '開始日',
    dateField: 'started_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '完了'],
    checklistTitle: '作業内容',
    defaultChecklist: ['配管搬入', '配管据付', 'その他'],
    detailLabel: '作業内容・備考',
    showChecklist: true,
  },
  '気密': {
    title: '気密',
    summary: '気密確認・漏れ確認の状況を管理します。',
    roleLabel: '担当',
    dateLabel: '開始日',
    dateField: 'started_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '完了'],
    checklistTitle: '作業内容',
    defaultChecklist: ['閉止確認', '気密確認', '漏れ確認', 'その他'],
    detailLabel: '作業内容・備考',
    showChecklist: true,
  },
  '試運転': {
    title: '試運転',
    summary: '試運転補助と動作確認の状況を管理します。',
    roleLabel: '担当',
    dateLabel: '開始日',
    dateField: 'started_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '完了'],
    checklistTitle: '作業内容',
    defaultChecklist: ['試運転補助', '動作確認', 'その他'],
    detailLabel: '作業内容・備考',
    showChecklist: true,
  },
  '修正': {
    title: '修正',
    summary: '修正作業と確認状況を管理します。',
    roleLabel: '担当',
    dateLabel: '開始日',
    dateField: 'started_at',
    statusOptions: ['未着手', '作業中', '確認待ち', '完了'],
    checklistTitle: '作業内容',
    defaultChecklist: ['補助', 'その他'],
    detailLabel: '修正内容・備考',
    showChecklist: true,
  },
  '完了': {
    title: '完了',
    summary: '工事が完了しているか、完了日だけを管理します。',
    roleLabel: '確認者',
    dateLabel: '完了日',
    dateField: 'completed_at',
    statusOptions: ['未完了', '完了'],
    checklistTitle: '完了確認',
    defaultChecklist: [],
    detailLabel: '備考',
    showChecklist: false,
    completionOnly: true,
  },
}

export function getWorkflowDetailSpec(title: string): WorkflowDetailSpec {
  return SPECS[title] ?? { ...DEFAULT_SPEC, title }
}

export function detailStatusToDbStatus(label: string, fallback = '未着手'): string {
  const value = label.trim()
  if (!value) return fallback === '確認待ち' ? '未着手' : fallback
  if (['未完了', '未着手', '未提出', '未受領', '未接収'].includes(value)) return '未着手'
  if (value === '確認待ち' || value === '承認待ち' || value.includes('待ち')) return '確認待ち'
  if (value.includes('修正')) return '修正中'
  if (value === '完了' || value === '確認完了' || value === '承認済み' || value.includes('承認済')) return '完了'
  if (value.includes('中') || value.includes('作業') || value.includes('作成') || value.includes('拾い') || value.includes('提出済み') || value.includes('製作準備')) return '作業中'
  if (value.includes('保留')) return '保留'
  return fallback === '確認待ち' ? '未着手' : fallback
}

export function isWaitingDetailStatus(label: string): boolean {
  const value = label.trim()
  return value === '確認待ち' || value === '承認待ち' || value.includes('待ち')
}
