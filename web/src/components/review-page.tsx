import { Archive, ArchiveRestore, ImagePlus, Send, Terminal, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { DropZone, FilePicker } from '@/components/drop-zone'
import { MarkedImage } from '@/components/marks'
import { StateBadge } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { addImages, api, imageUrl, latest, type Item, type ItemState, type Review } from '@/lib/api'
import { go, itemHash } from '@/lib/route'
import { cn } from '@/lib/utils'

type Filter = 'all' | ItemState

const FILTERS: { filter: Filter; label: string }[] = [
  { filter: 'all', label: 'All' },
  { filter: 'with_you', label: 'With you' },
  { filter: 'with_ai', label: 'With AI' },
  { filter: 'approved', label: 'Approved' },
]

export const hasMarks = (item: Item) => item.state === 'with_you' && (latest(item).annotations.length > 0 || latest(item).note.trim() !== '')

function ItemCard({ item }: { item: Item }) {
  const round = latest(item)
  const marks = round.annotations.length
  return (
    <Card className="cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md" onClick={() => go(itemHash(item.review_id, item.id))}>
      <div className="flex aspect-[4/3] items-center justify-center bg-muted p-2">
        <MarkedImage src={imageUrl(round.image)} width={round.width} height={round.height} annotations={round.annotations} className="size-full" />
      </div>
      <div className="grid gap-1.5 p-3">
        <div className="truncate text-sm font-medium">{item.name}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StateBadge state={item.state} />
          <span>Round {round.number}</span>
          {marks > 0 && <span>· {marks} mark{marks === 1 ? '' : 's'}</span>}
        </div>
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
      className="h-9 max-w-md border-transparent bg-transparent px-1 text-xl font-semibold shadow-none hover:border-input dark:bg-transparent"
    />
  )
}

export function ReviewPage({ review }: { review: Review }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ready = review.items.filter(hasMarks)
  const shown = review.items.filter((item) => filter === 'all' || item.state === filter)
  const count = (state: ItemState) => review.items.filter((item) => item.state === state).length

  const upload = (files: File[]) =>
    addImages(review.id, files)
      .then(() => toast.success(`Added ${files.length} image${files.length === 1 ? '' : 's'}`))
      .catch((e) => toast.error(e.message))

  const sendAll = () =>
    api
      .sendAll(review.id)
      .then(({ sent }) => toast.success(`Sent ${sent.length} to the AI`))
      .catch((e) => toast.error(e.message))

  const firstWithYou = review.items.find((item) => item.state === 'with_you')

  return (
    <DropZone label="Drop to add images" onFiles={upload}>
      <div className="mx-auto grid w-full max-w-7xl content-start gap-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Title review={review} />
          <div className="flex items-center gap-2">
            <FilePicker onFiles={upload}>
              {(pick) => (
                <Button variant="outline" onClick={pick}>
                  <ImagePlus />
                  Add images
                </Button>
              )}
            </FilePicker>
            <Button variant="ghost" size="icon" aria-label={review.archived ? 'Unarchive' : 'Archive'} onClick={() => api.updateReview(review.id, { archived: !review.archived })}>
              {review.archived ? <ArchiveRestore /> : <Archive />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Delete review" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
            {firstWithYou && (
              <Button variant="outline" onClick={() => go(itemHash(review.id, firstWithYou.id))}>
                Start marking up
              </Button>
            )}
            <Button onClick={sendAll} disabled={ready.length === 0}>
              <Send />
              Send {ready.length || ''} to AI
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
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Terminal className="size-3.5" />
            ochre wait --review {review.id} · ochre pull --review {review.id}
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
                Drop images here, or have the AI run <code className="font-mono">ochre add {review.id} image.png</code>.
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

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{review.title}”?</DialogTitle>
            <DialogDescription>Its {review.items.length} images and every round go with it. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => api.deleteReview(review.id).then(() => go('#/'))}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropZone>
  )
}
