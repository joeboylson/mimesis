import { ArrowLeft, Check, CheckCheck, ChevronLeft, ChevronRight, Columns2, MessageSquare, MoreHorizontal, PenLine, Redo, RotateCcw, Trash2, Undo, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Annotator, TOOLS, Toolbar, type Tool } from '@/components/annotator'
import { ConfirmDelete } from '@/components/confirm-delete'
import { COLORS, MarkedImage } from '@/components/marks'
import { StateBadge } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { api, imageUrl, latest, type Annotation, type Item, type Review, type Round } from '@/lib/api'
import { go, itemHash, reviewHash } from '@/lib/route'
import { cn } from '@/lib/utils'

const SAVE_DELAY_MS = 400

type Snapshot = { annotations: Annotation[]; note: string }

type Mode = 'mark' | 'compare'

const KIND_LABELS: Record<Annotation['kind'], string> = { rect: 'Box', ellipse: 'Circle', arrow: 'Arrow', pen: 'Drawing', pin: 'Pin' }

const isTyping = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

// After sending or approving, go to the next image that's waiting on the person.
function nextNeedsReview(review: Review, after: Item) {
  const index = review.items.findIndex((i) => i.id === after.id)
  const rest = [...review.items.slice(index + 1), ...review.items.slice(0, index)]
  return rest.find((i) => i.state === 'needs_review')
}

function goNext(review: Review, item: Item) {
  const next = nextNeedsReview(review, item)
  go(next ? itemHash(review.id, next.id) : reviewHash(review.id))
}

function NumberDot({ number, color }: { number: number; color: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-1 ring-border" style={{ background: color, color: color === '#ffffff' || color === '#eab308' ? '#000' : '#fff' }}>
      {number}
    </span>
  )
}

// Sits at the bottom of the image area so the header stays about the image.
function RoundPager({ item, round, onPick }: { item: Item; round: Round; onPick: (number: number) => void }) {
  if (item.rounds.length < 2) return null
  const at = item.rounds.findIndex((r) => r.id === round.id)
  const before = item.rounds[at - 1]
  const after = item.rounds[at + 1]
  return (
    <div className="absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
        <Button variant="ghost" size="icon-sm" aria-label="Previous round" disabled={!before} onClick={() => before && onPick(before.number)}>
          <ChevronLeft />
        </Button>
        <span className="px-1 text-xs text-muted-foreground">Round</span>
        {item.rounds.map((r) => (
          <Button key={r.id} variant={r.id === round.id ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => onPick(r.number)}>
            {r.number}
          </Button>
        ))}
        <Button variant="ghost" size="icon-sm" aria-label="Next round" disabled={!after} onClick={() => after && onPick(after.number)}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      <Button variant={mode === 'compare' ? 'outline' : 'ghost'} size="xs" onClick={() => setMode('compare')}>
        <Columns2 />
        Compare
      </Button>
      <Button variant={mode === 'mark' ? 'outline' : 'ghost'} size="xs" onClick={() => setMode('mark')}>
        <PenLine />
        Mark up
      </Button>
    </div>
  )
}

function AiNote({ round }: { round: Round }) {
  if (!round.ai_note.trim()) return null
  return (
    <div className="grid gap-1.5 rounded-lg border bg-muted/50 p-3 text-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare className="size-3.5" />
        Note with round {round.number}
      </div>
      <p className="whitespace-pre-wrap">{round.ai_note}</p>
    </div>
  )
}

function ReadOnlyMarks({ round }: { round: Round }) {
  if (round.annotations.length === 0 && !round.note.trim()) return <p className="text-sm text-muted-foreground">No marks on this round.</p>
  return (
    <div className="grid gap-3">
      {round.annotations.map((a, i) => (
        <div key={a.id} className="flex gap-2 text-sm">
          <NumberDot number={i + 1} color={a.color} />
          <span className={cn(!a.note.trim() && 'text-muted-foreground')}>{a.note.trim() || KIND_LABELS[a.kind]}</span>
        </div>
      ))}
      {round.note.trim() && <p className="border-t pt-3 text-sm whitespace-pre-wrap">{round.note}</p>}
    </div>
  )
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

// The round the person is marking up. Its marks live here and are saved as
// they change, so a reload from the server never wipes what's being typed.
function EditRound({
  review,
  item,
  round,
  previous,
  mode,
  setMode,
  pager,
}: {
  review: Review
  item: Item
  round: Round
  previous: Round | null
  mode: Mode
  setMode: (mode: Mode) => void
  pager: React.ReactNode
}) {
  const [annotations, setAnnotations] = useState(round.annotations)
  const [note, setNote] = useState(round.note)
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState(COLORS[0])
  const pending = useRef<{ annotations: Annotation[]; note: string } | null>(null)
  // Undo history of the marks. Typing in one mark's note counts as one step.
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const lastNoteEdit = useRef<string | null>(null)

  const flush = async () => {
    const changes = pending.current
    if (!changes) return
    pending.current = null
    await api.saveMarks(round.id, changes.annotations, changes.note)
  }

  const update = (next: Annotation[], nextNote = note) => {
    setAnnotations(next)
    setNote(nextNote)
    pending.current = { annotations: next, note: nextNote }
  }

  // `typing` names the text being edited (a mark's id, or 'overall'), so a
  // run of keystrokes in one box undoes as one step.
  const change = (next: Annotation[], nextNote = note, typing: string | null = null) => {
    if (typing === null || typing !== lastNoteEdit.current) {
      setPast([...past, { annotations, note }])
      setFuture([])
    }
    lastNoteEdit.current = typing
    update(next, nextNote)
  }

  const restore = (snapshot: Snapshot) => {
    lastNoteEdit.current = null
    update(snapshot.annotations, snapshot.note)
    if (selected && !snapshot.annotations.some((a) => a.id === selected)) setSelected(null)
  }

  const undo = () => {
    const previous = past.at(-1)
    if (!previous) return
    setPast(past.slice(0, -1))
    setFuture([{ annotations, note }, ...future])
    restore(previous)
  }

  const redo = () => {
    const [next, ...rest] = future
    if (!next) return
    setFuture(rest)
    setPast([...past, { annotations, note }])
    restore(next)
  }

  useEffect(() => {
    const timer = setTimeout(() => flush().catch((e) => toast.error(e.message)), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, note])

  // Leaving the item saves whatever hasn't been saved yet.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => void flush(), [])

  const send = async () => {
    try {
      await flush()
      await api.send(item.id)
      toast.success(`Marked ${item.name} as reviewed`)
      goNext(review, item)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const approve = async () => {
    try {
      await flush()
      await api.approve(item.id)
      toast.success(`Approved ${item.name}`)
      goNext(review, item)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const remove = (id: string) => {
    change(annotations.filter((a) => a.id !== id))
    if (selected === id) setSelected(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey
      if (command && event.key === 'Enter') {
        event.preventDefault()
        send()
        return
      }
      // Notes are in the history too, so undo is always the page's, even mid-note.
      const key = event.key.toLowerCase()
      if (command && (key === 'z' || (key === 'y' && event.ctrlKey))) {
        event.preventDefault()
        if (key === 'y' || event.shiftKey) redo()
        else undo()
        return
      }
      if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
      const picked = TOOLS.find((t) => t.key === event.key.toLowerCase())
      if (picked) {
        setTool(picked.tool)
        setMode('mark')
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected) remove(selected)
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const canSend = annotations.length > 0 || note.trim() !== ''

  return (
    <>
      <div className="relative min-w-0 flex-1 bg-muted/40">
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center gap-2">
          {mode === 'mark' && <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor} />}
          {mode === 'mark' && (
            <div className="flex gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
              <Button variant="ghost" size="icon-sm" aria-label="Undo (⌘Z)" title="Undo (⌘Z)" disabled={past.length === 0} onClick={undo}>
                <Undo />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Redo (⇧⌘Z)" title="Redo (⇧⌘Z)" disabled={future.length === 0} onClick={redo}>
                <Redo />
              </Button>
            </div>
          )}
        </div>
        {mode === 'mark' || !previous ? (
          <div className={cn('absolute inset-4 top-16', pager && 'bottom-16')}>
            <Annotator
              src={imageUrl(round.image)}
              width={round.width}
              height={round.height}
              annotations={annotations}
              onChange={(next) => change(next)}
              selected={selected}
              onSelect={setSelected}
              tool={tool}
              color={color}
              onCreated={setFocus}
            />
          </div>
        ) : (
          <div className={cn('absolute inset-4 grid grid-cols-2 gap-4', pager && 'bottom-16')}>
            <figure className="flex min-h-0 flex-col gap-2">
              <figcaption className="text-center text-xs text-muted-foreground">Round {previous.number}: your marks</figcaption>
              <MarkedImage src={imageUrl(previous.image)} width={previous.width} height={previous.height} annotations={previous.annotations} className="min-h-0 flex-1" />
            </figure>
            <figure className="flex min-h-0 flex-col gap-2">
              <figcaption className="text-center text-xs text-muted-foreground">Round {round.number}: new version</figcaption>
              <MarkedImage src={imageUrl(round.image)} width={round.width} height={round.height} annotations={annotations} className="min-h-0 flex-1" />
            </figure>
          </div>
        )}
        {pager}
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l">
        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-4">
          <AiNote round={round} />
          {previous && (
            <Section title={`Your marks, round ${previous.number}`}>
              <ReadOnlyMarks round={previous} />
            </Section>
          )}
          <Section title="Marks" action={annotations.length > 0 && <span className="text-xs text-muted-foreground">{annotations.length}</span>}>
            {annotations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Draw on the image to mark what should change. Each mark gets a number and a note.</p>
            ) : (
              <div className="grid gap-2">
                {annotations.map((a, i) => (
                  <div
                    key={a.id}
                    className={cn('grid gap-2 rounded-lg border p-2 transition-colors', selected === a.id ? 'border-ring bg-muted/50' : 'border-transparent')}
                    onClick={() => setSelected(a.id)}
                  >
                    <div className="flex items-center gap-2">
                      <NumberDot number={i + 1} color={a.color} />
                      <span className="flex-1 text-sm text-muted-foreground">{KIND_LABELS[a.kind]}</span>
                      <Button variant="ghost" size="icon-xs" aria-label="Delete mark" onClick={(e) => (e.stopPropagation(), remove(a.id))}>
                        <X />
                      </Button>
                    </div>
                    <Textarea
                      autoFocus={focus === a.id}
                      rows={2}
                      placeholder="What should change here?"
                      value={a.note}
                      onFocus={() => setSelected(a.id)}
                      onChange={(e) => change(annotations.map((other) => (other.id === a.id ? { ...other, note: e.target.value } : other)), note, a.id)}
                      className="min-h-0 resize-none text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Overall note">
            <Textarea rows={3} placeholder="Anything that isn't about one spot" value={note} onChange={(e) => change(annotations, e.target.value, 'overall')} className="resize-none text-sm" />
          </Section>
        </div>
        <div className="grid gap-2 border-t p-4">
          <Button onClick={send} disabled={!canSend}>
            <CheckCheck />
            Mark as reviewed
            <kbd className="ml-auto text-xs opacity-60">⌘↵</kbd>
          </Button>
          <Button variant="outline" onClick={approve}>
            <Check />
            Approve
          </Button>
        </div>
      </aside>
    </>
  )
}

function ViewRound({ item, round, isLatest, pager }: { item: Item; round: Round; isLatest: boolean; pager: React.ReactNode }) {
  const action = (call: Promise<unknown>) => call.catch((e) => toast.error(e.message))
  return (
    <>
      <div className="relative min-w-0 flex-1 bg-muted/40">
        <div className={cn('absolute inset-4', pager && 'bottom-16')}>
          <MarkedImage src={imageUrl(round.image)} width={round.width} height={round.height} annotations={round.annotations} className="size-full" />
        </div>
        {pager}
      </div>
      <aside className="flex w-80 shrink-0 flex-col border-l">
        <div className="grid flex-1 content-start gap-5 overflow-y-auto p-4">
          {isLatest && item.state === 'reviewed' && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <div className="font-medium">Reviewed</div>
              <p className="mt-1 text-muted-foreground">The next version shows up here when it's added.</p>
            </div>
          )}
          {isLatest && item.state === 'approved' && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-1.5 font-medium">
                <Check className="size-4" />
                Approved
              </div>
              <p className="mt-1 text-muted-foreground">Round {round.number} is the one.</p>
            </div>
          )}
          <AiNote round={round} />
          <Section title={`Marks, round ${round.number}`}>
            <ReadOnlyMarks round={round} />
          </Section>
        </div>
        {isLatest && (
          <div className="grid gap-2 border-t p-4">
            {item.state === 'reviewed' && (
              <Button variant="outline" onClick={() => action(api.unsend(item.id))}>
                <Undo2 />
                Reopen for review
              </Button>
            )}
            {item.state === 'reviewed' && (
              <Button variant="outline" onClick={() => action(api.approve(item.id))}>
                <Check />
                Approve as is
              </Button>
            )}
            {item.state === 'approved' && (
              <Button variant="outline" onClick={() => action(api.reopen(item.id))}>
                <RotateCcw />
                Reopen
              </Button>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

export function ItemPage({ review, item }: { review: Review; item: Item }) {
  const [viewing, setViewing] = useState<number | null>(null)
  useEffect(() => setViewing(null), [item.id])
  const current = latest(item)
  const round = item.rounds.find((r) => r.number === viewing) ?? current
  const isLatest = round.id === current.id
  const previous = item.rounds.find((r) => r.number === current.number - 1) ?? null
  const editing = isLatest && item.state === 'needs_review'
  const startMode = (): Mode => (previous && current.annotations.length === 0 ? 'compare' : 'mark')
  const [mode, setMode] = useState<Mode>(startMode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setMode(startMode()), [current.id])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pager = <RoundPager item={item} round={round} onPick={setViewing} />

  const index = review.items.findIndex((i) => i.id === item.id)
  const prev = review.items[index - 1]
  const next = review.items[index + 1]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.key === 'ArrowLeft' || event.key === 'k') && prev) go(itemHash(review.id, prev.id))
      if ((event.key === 'ArrowRight' || event.key === 'j') && next) go(itemHash(review.id, next.id))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, review.id])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Button variant="ghost" size="icon-sm" aria-label="Back to review" onClick={() => go(reviewHash(review.id))}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 truncate font-medium">{item.name}</div>
        <StateBadge state={item.state} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Image menu">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete image
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {editing && previous && (
          <div className="ml-4">
            <ModeToggle mode={mode} setMode={setMode} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
          <Button variant="ghost" size="icon-sm" disabled={!prev} aria-label="Previous image" onClick={() => prev && go(itemHash(review.id, prev.id))}>
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            {index + 1} / {review.items.length}
          </span>
          <Button variant="ghost" size="icon-sm" disabled={!next} aria-label="Next image" onClick={() => next && go(itemHash(review.id, next.id))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {editing ? (
          <EditRound key={round.id} review={review} item={item} round={round} previous={previous} mode={mode} setMode={setMode} pager={pager} />
        ) : (
          <ViewRound item={item} round={round} isLatest={isLatest} pager={pager} />
        )}
      </div>
      <ConfirmDelete
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${item.name}?`}
        description={`All ${item.rounds.length} round${item.rounds.length === 1 ? '' : 's'} of this image go with it. This can't be undone.`}
        onConfirm={() => api.deleteItem(item.id).then(() => go(reviewHash(review.id)))}
      />
    </div>
  )
}
