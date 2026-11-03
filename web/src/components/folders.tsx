import { ChevronDown, Folder as FolderIcon, FolderPlus, Layers, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDelete } from '@/components/confirm-delete'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api, type Folder } from '@/lib/api'
import { folderHash, go } from '@/lib/route'
import { cn } from '@/lib/utils'

// Dragging a review card onto a folder carries the review's id under this type.
export const REVIEW_DRAG = 'application/x-mimesis-review'

export function moveReview(reviewId: number, folder: Folder | null) {
  return api
    .setReviewFolder(reviewId, folder?.id ?? null)
    .then(() => toast.success(folder ? `Moved to ${folder.name}` : 'Moved out of its folder'))
    .catch((e) => toast.error(e.message))
}

// A plain link; the open folder is underlined. Review cards can be dropped on it.
function FolderRow({ label, count, picked, icon: Icon, href, onDropReview }: { label: string; count: number; picked: boolean; icon: typeof FolderIcon; href: string; onDropReview?: (reviewId: number) => void }) {
  const [over, setOver] = useState(false)
  return (
    <a
      href={href}
      aria-current={picked ? 'page' : undefined}
      onDragOver={(e) => {
        if (!onDropReview || !e.dataTransfer.types.includes(REVIEW_DRAG)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = Number(e.dataTransfer.getData(REVIEW_DRAG))
        if (onDropReview && id) onDropReview(id)
      }}
      className={cn('group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm', over && 'bg-muted ring-2 ring-ring')}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className={cn('flex-1 truncate underline-offset-4 group-hover:underline', picked && 'font-medium underline decoration-2')}>{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </a>
  )
}

function NameDialog({ title, initial, action, onSave, onClose }: { title: string; initial: string; action: string; onSave: (name: string) => Promise<unknown>; onClose: () => void }) {
  const [name, setName] = useState(initial)
  const save = () => {
    if (!name.trim()) return
    onSave(name.trim())
      .then(onClose)
      .catch((e) => toast.error(e.message))
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input autoFocus value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <DialogFooter>
          <Button onClick={save} disabled={!name.trim()}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FolderSidebar({ folders, folderId, total }: { folders: Folder[]; folderId: number | null; total: number }) {
  const [creating, setCreating] = useState(false)
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 border-r p-3">
      <FolderRow label="All reviews" count={total} picked={folderId === null} icon={Layers} href={folderHash(null)} onDropReview={(id) => moveReview(id, null)} />
      <div className="mt-3 mb-1 flex items-center justify-between px-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Folders</span>
        <Button variant="ghost" size="icon-xs" aria-label="New folder" title="New folder" onClick={() => setCreating(true)}>
          <FolderPlus />
        </Button>
      </div>
      {folders.map((folder) => (
        <FolderRow
          key={folder.id}
          label={folder.name}
          count={folder.reviews}
          picked={folderId === folder.id}
          icon={FolderIcon}
          href={folderHash(folder.id)}
          onDropReview={(id) => moveReview(id, folder)}
        />
      ))}
      {folders.length === 0 && <p className="px-2 text-xs text-muted-foreground">No folders yet.</p>}
      {creating && <NameDialog title="New folder" initial="" action="Create" onSave={(name) => api.createFolder(name).then((f) => go(folderHash(f.id)))} onClose={() => setCreating(false)} />}
    </aside>
  )
}

export function FolderMenu({ folder }: { folder: Folder }) {
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Folder menu">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            Rename folder
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 />
            Delete folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <NameDialog title="Rename folder" initial={folder.name} action="Save" onSave={(name) => api.updateFolder(folder.id, { name })} onClose={() => setRenaming(false)} />}
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${folder.name}”?`}
        description={`Its ${folder.reviews} review${folder.reviews === 1 ? '' : 's'} stay, outside any folder. Its preferences are deleted.`}
        onConfirm={() => api.deleteFolder(folder.id).then(() => go(folderHash(null)))}
      />
    </>
  )
}

// The panel stays open or shut per folder, across refreshes.
const openKey = (id: number) => `mimesis-prefs-open-${id}`
function readOpen(id: number) {
  try {
    return localStorage.getItem(openKey(id)) === '1'
  } catch {
    return false
  }
}

export function PreferencesPanel({ folder }: { folder: Folder }) {
  const [open, setOpen] = useState(() => readOpen(folder.id))
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(folder.preferences)
  useEffect(() => {
    setOpen(readOpen(folder.id))
    setEditing(false)
  }, [folder.id])
  useEffect(() => {
    if (!editing) setText(folder.preferences)
  }, [folder.preferences, editing])

  const toggle = () => {
    setOpen(!open)
    try {
      localStorage.setItem(openKey(folder.id), open ? '0' : '1')
    } catch {
      // Not remembered.
    }
  }
  const save = () =>
    api
      .updateFolder(folder.id, { preferences: text })
      .then(() => {
        setEditing(false)
        toast.success('Saved preferences')
      })
      .catch((e) => toast.error(e.message))

  const lines = folder.preferences.trim().split('\n').filter((line) => line.trim()).length
  return (
    <section className="rounded-lg border bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={toggle} className="flex flex-1 items-center gap-2 text-left text-sm font-medium">
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
          Preferences
          {!lines && <span className="font-normal text-muted-foreground">none yet</span>}
        </button>
        {open && !editing && (
          <Button variant="ghost" size="icon-sm" aria-label="Edit preferences" title="Edit preferences" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t px-3 py-3">
          {editing ? (
            <div className="grid gap-2">
              <Textarea autoFocus rows={Math.min(18, Math.max(6, text.split('\n').length + 1))} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-sm" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={save}>
                  Save
                </Button>
              </div>
            </div>
          ) : folder.preferences.trim() ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{folder.preferences.trim()}</div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Distilled from the notes in this folder's reviews by <code className="font-mono">mimesis folder notes</code>.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
