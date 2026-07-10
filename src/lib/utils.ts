export function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function safeFileName(name: string) {
  const trimmedName = name.trim()

  const extensionMatch = trimmedName.match(/\.([A-Za-z0-9]{1,10})$/)
  const extension = extensionMatch
    ? `.${extensionMatch[1].toLowerCase()}`
    : ''

  const baseName = extension
    ? trimmedName.slice(0, -extension.length)
    : trimmedName

  const safeBaseName = baseName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 120)

  return `${safeBaseName || 'file'}${extension}`
}

export function humanBytes(value?: number | null) {
  if (!value) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

const UPLOAD_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

export function resolveUploadContentType(
  fileName: string,
  browserContentType?: string,
) {
  const normalizedName = fileName.trim().toLowerCase()

  const matchedExtension = Object.keys(UPLOAD_CONTENT_TYPES).find(
    (extension) => normalizedName.endsWith(extension),
  )

  if (matchedExtension) {
    return UPLOAD_CONTENT_TYPES[matchedExtension]
  }

  return browserContentType?.trim() || 'application/octet-stream'
}
