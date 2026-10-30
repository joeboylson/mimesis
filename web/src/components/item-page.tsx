import { ArrowLeft, Check, CheckCheck, ChevronLeft, ChevronRight, Columns2, MessageSquare, PenLine, Redo, RotateCcw, Trash2, Undo, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Annotator, TOOLS, Toolbar, type Tool } from '@/components/annotator'
import { COLORS, MarkedImage } from '@/components/marks'
import { StateBadge } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api, imageUrl, latest, type Annotation, type Item, type Review, type Round } from '@/lib/api'
import { go, itemHash, reviewHash } from '@/lib/route'
import { cn } from '@/lib/utils'

const SAVE_DELAY_MS = 400

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
function EditRound({ review, item, round, previous }: { review: Review; item: Item; round: Round; previous: Round | null }) {
  const [annotations, setAnnotations] = useState(round.annotations)
  const [note, setNote] = useState(round.note)
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('rect')
  const [color, setColor] = useState(COLORS[0])
  const [mode, setMode] = useState<'mark' | 'compare'>(previous && round.annotations.length === 0 ? 'compare' : 'mark')
  const pending = useRef<{ annotations: Annotation[]; note: string } | null>(null)
  // Undo history of the marks. Typing in one mark's note counts as one step.
  const [past, setPast] = useState<Annotation[][]>([])
  const [future, setFuture] = useState<Annotation[][]>([])
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

  const change = (next: Annotation[], noteOf: string | null = null) => {
    if (noteOf === null || noteOf !== lastNoteEdit.current) {
      setPast([...past, annotations])
      setFuture([])
    }
    lastNoteEdit.current = noteOf
    update(next)
  }

  const undo = () => {
    const previous = past.at(-1)
    if (!previous) return
    setPast(past.slice(0, -1))
    setFuture([annotations, ...future])
    lastNoteEdit.current = null
    update(previous)
    if (selected && !previous.some((a) => a.id === selected)) setSelected(null)
  }

  const redo = () => {
    const [next, ...rest] = future
    if (!next) return
    setFuture(rest)
    setPast([...past, annotations])
    lastNoteEdit.current = null
    update(next)
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
      // In a note box, undo is the text's own; elsewhere it's the marks'.
      const key = event.key.toLowerCase()
      if (command && (key === 'z' || (key === 'y' && event.ctrlKey)) && !isTyping(event)) {
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
          {previous && (
            <div className="flex gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
              <Button variant={mode === 'compare' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('compare')}>
                <Columns2 />
                Compare
              </Button>
              <Button variant={mode === 'mark' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('mark')}>
                <PenLine />
                Mark up
              </Button>
            </div>
          )}
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
          <div className="absolute inset-4 top-16">
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
          <div className="absolute inset-4 top-16 grid grid-cols-2 gap-4">
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
                      onChange={(e) => change(annotations.map((other) => (other.id === a.id ? { ...other, note: e.target.value } : other)), a.id)}
                      className="min-h-0 resize-none text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </Section>
          <Section title="Overall note">
            <Textarea rows={3} placeholder="Anything that isn't about one spot" value={note} onChange={(e) => update(annotations, e.target.value)} className="resize-none text-sm" />
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

function ViewRound({ item, round, isLatest }: { item: Item; round: Round; isLatest: boolean }) {
  const action = (call: Promise<unknown>) => call.catch((e) => toast.error(e.message))
  return (
    <>
      <div className="relative min-w-0 flex-1 bg-muted/40">
        <div className="absolute inset-4">
          <MarkedImage src={imageUrl(round.image)} width={round.width} height={round.height} annotations={round.annotations} className="size-full" />
        </div>
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
        <div className="ml-2 flex items-center gap-1">
          {item.rounds.map((r) => (
            <Button key={r.id} variant={r.id === round.id ? 'secondary' : 'ghost'} size="xs" onClick={() => setViewing(r.number)}>
              R{r.number}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
          <Button variant="ghost" size="icon-sm" aria-label="Delete image" onClick={() => api.deleteItem(item.id).then(() => go(reviewHash(review.id)))}>
            <Trash2 />
          </Button>
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
        {isLatest && item.state === 'needs_review' ? (
          <EditRound key={round.id} review={review} item={item} round={round} previous={previous} />
        ) : (
          <ViewRound item={item} round={round} isLatest={isLatest} />
        )}
      </div>
    </div>
  )
}
