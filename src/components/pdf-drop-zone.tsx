'use client'

import { DragEvent, useRef, useState } from 'react'
import { FileText, UploadCloud, X } from 'lucide-react'

type Props = {
  files: File[]
  onFiles: (files: File[]) => void
  multiple?: boolean
  disabled?: boolean
  title?: string
  hint?: string
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function PdfDropZone({
  files,
  onFiles,
  multiple = false,
  disabled = false,
  title = 'PDFをここにドラッグ＆ドロップ',
  hint = 'またはクリックしてPDFを選択',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function acceptFiles(next: File[]) {
    const pdfs = next.filter(isPdf)
    if (pdfs.length === 0) return
    onFiles(multiple ? pdfs : [pdfs[0]])
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (disabled) return
    setDragging(false)
    acceptFiles(Array.from(event.dataTransfer.files))
  }

  function removeAt(index: number) {
    onFiles(files.filter((_, current) => current !== index))
  }

  return (
    <div className="pdf-drop-wrap">
      <div
        className={`pdf-drop-zone ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) inputRef.current?.click()
        }}
      >
        <UploadCloud size={34} />
        <strong>{title}</strong>
        <span>{hint}</span>
        <small>{multiple ? '複数のPDFを一度に追加できます' : 'PDFのみ'}</small>
        <input
          ref={inputRef}
          className="pdf-file-input"
          type="file"
          accept="application/pdf,.pdf"
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            acceptFiles(Array.from(event.target.files ?? []))
            event.currentTarget.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="pdf-selected-list">
          {files.map((file, index) => (
            <div className="pdf-selected-item" key={`${file.name}-${file.size}-${index}`}>
              <FileText size={18} />
              <div>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <button type="button" className="icon-button danger" onClick={(event) => { event.stopPropagation(); removeAt(index) }} aria-label="削除">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
