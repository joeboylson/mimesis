import { ImagePlus, Images, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { DropZone, FilePicker } from '@/components/drop-zone'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useReviews } from '@/hooks/use-ochre'
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
          <DialogDescription>A set of images to mark up and send to the AI. You can add more later, or the AI can.</DialogDescription>
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

function ReviewCard({ review }: { review: ReviewSummary }) {
  return (
    <Card className="cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md" onClick={() => go(reviewHash(review.id))}>
      <div className="flex aspect-video items-center justify-center bg-muted">
        {review.cover ? <img src={imageUrl(review.cover)} alt="" className="size-full object-contain" /> : <Images className="size-8 text-muted-foreground" />}
      </div>
      <div className="grid gap-2 p-3">
        <div className="truncate font-medium">{review.title}</div>
        <div className="flex flex-wrap gap-1">
          {review.with_you > 0 && <Badge>{review.with_you} with you</Badge>}
          {review.with_ai > 0 && <Badge variant="secondary">{review.with_ai} with AI</Badge>}
          {review.approved > 0 && <Badge variant="outline">{review.approved} approved</Badge>}
          {review.total === 0 && <Badge variant="outline">No images</Badge>}
          {review.archived && <Badge variant="ghost">Archived</Badge>}
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
      <div className="mx-auto grid w-full max-w-6xl gap-6 overflow-y-auto p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Reviews</h1>
          <div className="flex items-center gap-2">
            {archivedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
              </Button>
            )}
            <Button onClick={() => setDialog({ files: [] })}>
              <Plus />
              New review
            </Button>
          </div>
        </div>
        {reviews && shown.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Images />
              </EmptyMedia>
              <EmptyTitle>No reviews yet</EmptyTitle>
              <EmptyDescription>
                Drop images here to start one, or have the AI run <code className="font-mono">ochre new "Title" a.png b.png</code>.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setDialog({ files: [] })}>
                <Plus />
                New review
              </Button>
            </EmptyContent>
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
