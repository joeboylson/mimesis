import { ArrowLeft, Bot, Check, CheckCheck, ChevronLeft, ChevronRight, Columns2, MessageSquare, MoreHorizontal, Redo, RotateCcw, Trash2, Undo, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Annotator, PICKED, TOOLS, Toolbar, type Tool } from '@/components/annotator'
import { CompareBar, CompareCanvas, type CompareView } from '@/components/compare-views'
import { askToNotify } from '@/hooks/use-arrivals'
import { ConfirmDelete } from '@/components/confirm-delete'
import { COLORS } from '@/components/marks'
import { StateBadge } from '@/components/state-badge'
import { Button } from '@/components/ui/button'
import { ZoomCanvas } from '@/components/zoom-canvas'
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
        <div key={a.id} className="grid gap-1.5 text-sm">
          <div className="flex gap-2">
            <NumberDot number={i + 1} color={a.color} />
            <span className={cn(!a.note.trim() && 'text-muted-foreground')}>{a.note.trim() || KIND_LABELS[a.kind]}</span>
          </div>
          {a.reply?.trim() && (
            <div className="ml-7 flex gap-2 text-muted-foreground">
              <Bot className="mt-0.5 size-4 shrink-0" aria-label="The AI's reply" />
              <span className="whitespace-pre-wrap">{a.reply}</span>
            </div>
          )}
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
  // A right drag in progress, which moves around without changing the tool.
  const [holding, setHolding] = useState(false)
  const [color, setColor] = useState(COLORS[0])
  const [fitKey, setFitKey] = useState(0)
  const drawing = mode === 'mark' || !previous
  const [compareView, setCompareView] = useState<CompareView>('side')
  const [opacity, setOpacity] = useState(0.5)
  const [flickerMs, setFlickerMs] = useState(400)
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
      askToNotify()
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
      if (event.key === '0') setFitKey((k) => k + 1)
      if (event.key === '\\' && previous) setMode(mode === 'compare' ? 'mark' : 'compare')
      const picked = TOOLS.find((t) => t.key && t.key === event.key.toLowerCase())
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
          <Toolbar tool={tool} setTool={setTool} color={color} setColor={setColor} onFit={() => setFitKey((k) => k + 1)} drawing={drawing} holding={holding} />
          <div className="flex gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
            <Button variant="ghost" size="icon-sm" aria-label="Undo (⌘Z)" title="Undo (⌘Z)" disabled={!drawing || past.length === 0} onClick={undo}>
              <Undo />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Redo (⇧⌘Z)" title="Redo (⇧⌘Z)" disabled={!drawing || future.length === 0} onClick={redo}>
              <Redo />
            </Button>
          </div>
          <div className="flex gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={mode === 'compare'}
              disabled={!previous}
              title={previous ? 'Compare with the last round (\\)' : 'Nothing to compare yet: this is the first round'}
              onClick={() => setMode(mode === 'compare' ? 'mark' : 'compare')}
              className={cn('relative', mode === 'compare' && PICKED)}
            >
              <Columns2 />
              Compare
            </Button>
          </div>
        </div>
        {!drawing && (
          <div className="absolute inset-x-0 top-15 z-10 flex justify-center">
            <CompareBar view={compareView} setView={setCompareView} opacity={opacity} setOpacity={setOpacity} flickerMs={flickerMs} setFlickerMs={setFlickerMs} />
          </div>
        )}
        {drawing ? (
          <ZoomCanvas
            className={cn('absolute inset-0', pager && 'bottom-14')}
            insetTop={40}
            canDrag={tool === 'move'}
            fitKey={fitKey}
            onHolding={setHolding}
            panels={[
              {
                src: imageUrl(round.image),
                width: round.width,
                height: round.height,
                annotations,
                render: (size) => (
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
                    size={size}
                  />
                ),
              },
            ]}
          />
        ) : (
          <CompareCanvas
            className={cn('absolute inset-0', pager && 'bottom-14')}
            insetTop={92}
            fitKey={fitKey}
            previous={previous}
            round={round}
            annotations={annotations}
            view={compareView}
            opacity={opacity}
            flickerMs={flickerMs}
          />
        )}
        {pager}
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l">
        {mode === 'compare' && previous ? (
          // Comparing: nothing can be drawn, so the sidebar shows what came back and what was asked for.
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-4">
            <AiNote round={round} />
            <Section title={`Your marks, round ${previous.number}`}>
              <ReadOnlyMarks round={previous} />
            </Section>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-4">
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
            </div>
            {/* Pinned under the marks, laid out like one of them. */}
            <div className="border-t p-4 pb-0">
              <div className="grid gap-2 rounded-lg border border-transparent p-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <span className="flex-1 text-sm text-muted-foreground">Overall note</span>
                </div>
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => change(annotations, e.target.value, 'overall')}
                  className="min-h-0 resize-none text-sm"
                />
              </div>
            </div>
          </>
        )}
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
  const [fitKey, setFitKey] = useState(0)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '0') setFitKey((k) => k + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <div className="relative min-w-0 flex-1 bg-muted/40">
        {/* Past rounds can't be drawn on; the bar is there for Move and Fit. */}
        <div className="absolute inset-x-0 top-3 z-10 flex justify-center">
          <Toolbar tool="move" setTool={() => {}} color={COLORS[0]} setColor={() => {}} onFit={() => setFitKey((k) => k + 1)} drawing={false} />
        </div>
        <ZoomCanvas
          className={cn('absolute inset-0', pager && 'bottom-14')}
          insetTop={40}
          fitKey={fitKey}
          panels={[{ src: imageUrl(round.image), width: round.width, height: round.height, annotations: round.annotations }]}
        />
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
  // Compare is off until switched on, for each new round.
  const [mode, setMode] = useState<Mode>('mark')
  useEffect(() => setMode('mark'), [current.id])
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
