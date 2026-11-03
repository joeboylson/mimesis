import { ArrowUpRight, Circle, Hand, MapPin, Maximize, MousePointer2, Pencil, Square } from 'lucide-react'
import { useRef, useState } from 'react'

import { COLORS, Marks } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Annotation } from '@/lib/api'
import { cn } from '@/lib/utils'

// 'move' drags the view around instead of drawing; Space switches to it and back.
export type Tool = 'move' | 'select' | 'rect' | 'ellipse' | 'arrow' | 'pen' | 'pin'

export const TOOLS: { tool: Tool; label: string; key: string; icon: typeof Square }[] = [
  { tool: 'move', label: 'Move', key: 'space', icon: Hand },
  { tool: 'select', label: 'Select', key: 'v', icon: MousePointer2 },
  { tool: 'rect', label: 'Box', key: 'r', icon: Square },
  { tool: 'ellipse', label: 'Circle', key: 'o', icon: Circle },
  { tool: 'arrow', label: 'Arrow', key: 'a', icon: ArrowUpRight },
  { tool: 'pen', label: 'Draw', key: 'p', icon: Pencil },
  { tool: 'pin', label: 'Pin', key: 'n', icon: MapPin },
]

const newId = () => Math.random().toString(36).slice(2, 10)
const clamp = (v: number) => Math.min(Math.max(v, 0), 1)

// `drawing` off (Compare, earlier rounds) greys out everything but Move and Fit.
export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  onFit,
  drawing = true,
}: {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
  setColor: (c: string) => void
  onFit: () => void
  drawing?: boolean
}) {
  const current = drawing ? tool : 'move'
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
      {TOOLS.map(({ tool: t, label, key, icon: Icon }) => (
        <Tooltip key={t}>
          <TooltipTrigger asChild>
            <Button variant={current === t ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setTool(t)} aria-label={label} disabled={!drawing && t !== 'move'}>
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {label} <span className="text-muted-foreground uppercase">{key}</span>
          </TooltipContent>
        </Tooltip>
      ))}
      <div className="mx-1 h-5 w-px bg-border" />
      {COLORS.map((c) => (
        <button
          key={c}
          aria-label={`Colour ${c}`}
          onClick={() => setColor(c)}
          disabled={!drawing}
          className={cn(
            'size-5 rounded-full border border-border transition-transform disabled:opacity-40',
            drawing && color === c && 'scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background',
          )}
          style={{ background: c }}
        />
      ))}
      <div className="mx-1 h-5 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onFit} aria-label="Fit">
            <Maximize />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Fit on screen <span className="text-muted-foreground">0</span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export function Annotator({
  src,
  width,
  height,
  annotations,
  onChange,
  selected,
  onSelect,
  tool,
  color,
  onCreated,
  size,
}: {
  src: string
  width: number
  height: number
  annotations: Annotation[]
  onChange: (next: Annotation[]) => void
  selected: string | null
  onSelect: (id: string | null) => void
  tool: Tool
  color: string
  onCreated: (id: string) => void
  // A fixed size on screen, inside the zoomable canvas.
  size?: { width: number; height: number }
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [draft, setDraft] = useState<Annotation | null>(null)
  const start = useRef<[number, number]>([0, 0])

  const toFraction = (event: React.PointerEvent): [number, number] => {
    const element = svg.current!
    const matrix = element.getScreenCTM()!.inverse()
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
    return [clamp(point.x / width), clamp(point.y / height)]
  }

  const commit = (annotation: Annotation) => {
    onChange([...annotations, annotation])
    onSelect(annotation.id)
    onCreated(annotation.id)
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    if (tool === 'move') return
    if (tool === 'select') return onSelect(null)
    event.stopPropagation()
    const [x, y] = toFraction(event)
    start.current = [x, y]
    const base = { id: newId(), color, note: '' }
    if (tool === 'pin') return commit({ ...base, kind: 'pin', x, y })
    svg.current!.setPointerCapture(event.pointerId)
    if (tool === 'rect' || tool === 'ellipse') setDraft({ ...base, kind: tool, x, y, w: 0, h: 0 })
    if (tool === 'arrow') setDraft({ ...base, kind: 'arrow', x1: x, y1: y, x2: x, y2: y })
    if (tool === 'pen') setDraft({ ...base, kind: 'pen', points: [[x, y]] })
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!draft) return
    const [x, y] = toFraction(event)
    const [sx, sy] = start.current
    if (draft.kind === 'rect' || draft.kind === 'ellipse')
      setDraft({ ...draft, x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) })
    if (draft.kind === 'arrow') setDraft({ ...draft, x2: x, y2: y })
    if (draft.kind === 'pen') setDraft({ ...draft, points: [...draft.points, [x, y]] })
  }

  const onPointerUp = () => {
    if (!draft) return
    setDraft(null)
    const big =
      ((draft.kind === 'rect' || draft.kind === 'ellipse') && draft.w > 0.004 && draft.h > 0.004) ||
      (draft.kind === 'arrow' && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.01) ||
      (draft.kind === 'pen' && draft.points.length > 2)
    if (big) commit(draft)
  }

  const shown = draft ? [...annotations, draft] : annotations
  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      width={size?.width}
      height={size?.height}
      className={cn('block touch-none select-none', !size && 'size-full', tool === 'select' ? 'cursor-default' : tool !== 'move' && 'cursor-crosshair')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDraft(null)}
    >
      <image href={src} width={width} height={height} />
      <Marks annotations={shown} width={width} height={height} selected={selected} onSelect={tool === 'select' ? onSelect : undefined} />
    </svg>
  )
}
