import { ImagePlus } from 'lucide-react'
import { useState } from 'react'

import { isImage } from '@/lib/api'

// Accepts images dropped anywhere on the page.
export function DropZone({ onFiles, label, children }: { onFiles: (files: File[]) => void; label: string; children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes('Files')
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setOver(false)
        const files = Array.from(event.dataTransfer.files).filter(isImage)
        if (files.length) onFiles(files)
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ImagePlus className="size-5" />
            {label}
          </div>
        </div>
      )}
    </div>
  )
}

export function FilePicker({ onFiles, children }: { onFiles: (files: File[]) => void; children: (open: () => void) => React.ReactNode }) {
  let input: HTMLInputElement | null = null
  return (
    <>
      <input
        ref={(element) => {
          input = element
        }}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).filter(isImage)
          event.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
      {children(() => input?.click())}
    </>
  )
}
