import { Bot, ImagePlus, Images, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DropZone, FilePicker } from '@/components/drop-zone'
import { STATE_COLORS } from '@/components/state-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { copyText } from '@/components/copy-button'
import { useReviews } from '@/hooks/use-mimesis'
import { addImages, api, imageUrl, type ReviewSummary } from '@/lib/api'
import { go, reviewHash } from '@/lib/route'

const defaultTitle = () => `Review ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`

async function startReview(title: string, files: File[]) {
  const review = await api.createReview(title)
  await addImages(review.id, files)
  go(reviewHash(review.id))
}

function NewReviewDialog({ open, onOpenChange, files: initial }: { open: boolean; onOpenChange: (open: boolean) => void; files: File[] }) {
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<File[]>(initial)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      await startReview(title || defaultTitle(), files)
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New review</DialogTitle>
          <DialogDescription>A set of images to mark up. You can add more later.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" autoFocus placeholder={defaultTitle()} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          </div>
          <FilePicker onFiles={(picked) => setFiles([...files, ...picked])}>
            {(pick) => (
              <Button variant="outline" onClick={pick}>
                <ImagePlus />
                {files.length ? `${files.length} image${files.length === 1 ? '' : 's'} — add more` : 'Choose images'}
              </Button>
            )}
          </FilePicker>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// What to paste to an agent so it starts a review and works it with you.
const START_PROMPT =
  'Start a new Mimesis review: run `mimesis guide` (and `mimesis skill list` for a skill that fits), put the images in with `mimesis new`, then wait for my review and make new versions until I approve each one.'

function StartWithAi() {
  const copy = () =>
    copyText(START_PROMPT)
      .then(() => toast.success('Copied a prompt for your agent', { description: 'Paste it into Claude Code or any agent with mimesis installed.' }))
      .catch((e) => toast.error(e.message))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Start a new review with AI" onClick={copy}>
          <Bot />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Start a new review with AI</TooltipContent>
    </Tooltip>
  )
}

function ReviewCard({ review }: { review: ReviewSummary }) {
  return (
    <Card className="cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md" onClick={() => go(reviewHash(review.id))}>
      <div className="flex aspect-video items-center justify-center bg-muted">
        {review.cover ? <img src={imageUrl(review.cover)} alt="" className="size-full object-contain" /> : <Images className="size-8 text-muted-foreground" />}
      </div>
      <div className="grid gap-2 p-3">
        <div className="truncate font-medium">{review.title}</div>
        <div className="flex flex-wrap gap-1">
          {review.archived && <Badge variant="ghost">Finished</Badge>}
          {review.needs_review > 0 && <Badge variant="outline" className={STATE_COLORS.needs_review}>{review.needs_review} need review</Badge>}
          {review.reviewed > 0 && <Badge variant="outline" className={STATE_COLORS.reviewed}>{review.reviewed} reviewed</Badge>}
          {review.approved > 0 && <Badge variant="outline" className={STATE_COLORS.approved}>{review.approved} approved</Badge>}
          {review.total === 0 && <Badge variant="outline">No images</Badge>}
        </div>
      </div>
    </Card>
  )
}

export function ReviewsPage({ version }: { version: number | null }) {
  const { data: reviews } = useReviews(version)
  const [dialog, setDialog] = useState<{ files: File[] } | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const shown = (reviews ?? []).filter((r) => showArchived || !r.archived)
  const archivedCount = (reviews ?? []).filter((r) => r.archived).length

  return (
    <DropZone label="Drop to start a review" onFiles={(files) => setDialog({ files })}>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Reviews</h1>
          <div className="flex items-center gap-2">
            {archivedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide finished' : `Show finished (${archivedCount})`}
              </Button>
            )}
            <Button onClick={() => setDialog({ files: [] })}>
              <Plus />
              New review
            </Button>
            <StartWithAi />
          </div>
        </div>
        {reviews && shown.length === 0 ? (
          <Empty className="flex-1 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Images />
              </EmptyMedia>
              <EmptyTitle>No reviews yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
            {shown.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </div>
      {dialog && <NewReviewDialog open onOpenChange={(open) => !open && setDialog(null)} files={dialog.files} />}
    </DropZone>
  )
}
