import { Check, CheckCheck, Folder as FolderIcon, FolderInput, ImagePlus, MoreHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDelete } from '@/components/confirm-delete'
import { DropZone, FilePicker } from '@/components/drop-zone'
import { MarkedImage } from '@/components/marks'
import { StateBadge } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { moveReview } from '@/components/folders'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { addImages, api, imageUrl, latest, type Folder, type Item, type ItemState, type Review } from '@/lib/api'
import { go, itemHash } from '@/lib/route'
import { cn } from '@/lib/utils'

type Filter = 'all' | ItemState

const FILTERS: { filter: Filter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'needs_review', label: 'Needs review' },
  { filter: 'reviewed', label: 'Reviewed' },
  { filter: 'approved', label: 'Approved' },
]

// The picked tab is kept per review, so a refresh or a trip into an image
// comes back to the same tab.
const filterKey = (reviewId: number) => `mimesis-filter-${reviewId}`

function savedFilter(reviewId: number): Filter {
  try {
    const saved = localStorage.getItem(filterKey(reviewId))
    if (FILTERS.some(({ filter }) => filter === saved)) return saved as Filter
  } catch {
    // Storage can be blocked; the default tab is fine then.
  }
  return 'all'
}

function useFilter(reviewId: number) {
  const [filter, setFilter] = useState<Filter>(() => savedFilter(reviewId))
  useEffect(() => setFilter(savedFilter(reviewId)), [reviewId])
  const pick = (next: Filter) => {
    setFilter(next)
    try {
      localStorage.setItem(filterKey(reviewId), next)
    } catch {
      // Not saved; the tab still changes for now.
    }
  }
  return [filter, pick] as const
}

function ItemCard({ item }: { item: Item }) {
  const round = latest(item)
  return (
    <Card className="cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md" onClick={() => go(itemHash(item.review_id, item.id))}>
      <div className="relative aspect-square bg-muted">
        <MarkedImage src={imageUrl(round.image)} width={round.width} height={round.height} annotations={round.annotations} className="absolute inset-0 size-full p-2" />
        <StateBadge state={item.state} className="absolute top-2 right-2 shadow-sm" />
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium">{item.name}</div>
      </div>
    </Card>
  )
}

function Title({ review }: { review: Review }) {
  const [title, setTitle] = useState(review.title)
  useEffect(() => setTitle(review.title), [review.title])
  const save = () => {
    if (title.trim() && title !== review.title) api.updateReview(review.id, { title }).catch((e) => toast.error(e.message))
  }
  return (
    <Input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="field-sizing-content h-9 w-auto max-w-md min-w-24 border-transparent bg-transparent px-1 text-xl font-semibold shadow-none hover:border-input dark:bg-transparent"
    />
  )
}

export function ReviewPage({ review }: { review: Review }) {
  const [filter, setFilter] = useFilter(review.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  useEffect(() => {
    api.folders().then(setFolders).catch(() => {})
  }, [review.folder_id])
  const allApproved = review.items.length > 0 && review.items.every((item) => item.state === 'approved')
  const shown = review.items.filter((item) => filter === 'all' || item.state === filter)
  const count = (state: ItemState) => review.items.filter((item) => item.state === state).length

  const upload = (files: File[]) =>
    addImages(review.id, files)
      .then(() => toast.success(`Added ${files.length} image${files.length === 1 ? '' : 's'}`))
      .catch((e) => toast.error(e.message))

  const finish = () =>
    api
      .updateReview(review.id, { archived: true })
      .then(() => {
        toast.success(`Finished “${review.title}”`)
        go('#/')
      })
      .catch((e) => toast.error(e.message))

  const firstNeedsReview = review.items.find((item) => item.state === 'needs_review')

  return (
    <DropZone label="Drop to add images" onFiles={upload}>
      <div className="mx-auto grid w-full max-w-7xl content-start gap-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <Title review={review} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Review menu">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput />
                    Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {folders.map((folder) => (
                      <DropdownMenuItem key={folder.id} onSelect={() => moveReview(review.id, folder)}>
                        {folder.id === review.folder_id ? <Check /> : <FolderIcon />}
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                    {folders.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem disabled={review.folder_id === null} onSelect={() => moveReview(review.id, null)}>
                      No folder
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Delete review
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2">
            <FilePicker onFiles={upload}>
              {(pick) => (
                <Button variant="outline" onClick={pick}>
                  <ImagePlus />
                  Add images
                </Button>
              )}
            </FilePicker>
            {firstNeedsReview && (
              <Button variant="outline" onClick={() => go(itemHash(review.id, firstNeedsReview.id))}>
                Start marking up
              </Button>
            )}
            <Button onClick={finish} disabled={!allApproved || review.archived} title={allApproved ? undefined : 'Approve every image first'}>
              <CheckCheck />
              {review.archived ? 'Finished' : 'Finish review'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {FILTERS.map(({ filter: f, label }) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn('rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors', filter === f && 'bg-background text-foreground shadow-sm')}
              >
                {label} <span className="text-xs opacity-60">{f === 'all' ? review.items.length : count(f)}</span>
              </button>
            ))}
          </div>
        </div>

        {review.items.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImagePlus />
              </EmptyMedia>
              <EmptyTitle>No images yet</EmptyTitle>
              <EmptyDescription>
                Drop images here, or run <code className="font-mono">mimesis add {review.id} image.png</code>.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4">
            {shown.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${review.title}”?`}
        description={`Its ${review.items.length} images and every round go with it. This can't be undone.`}
        onConfirm={() => api.deleteReview(review.id).then(() => go('#/'))}
      />
    </DropZone>
  )
}
