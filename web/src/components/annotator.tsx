import { ArrowUpRight, Circle, MapPin, MousePointer2, Pencil, Square } from 'lucide-react'
import { useRef, useState } from 'react'

import { COLORS, Marks } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Annotation } from '@/lib/api'
import { cn } from '@/lib/utils'

export type Tool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'pen' | 'pin'

export const TOOLS: { tool: Tool; label: string; key: string; icon: typeof Square }[] = [
  { tool: 'select', label: 'Select', key: 'v', icon: MousePointer2 },
  { tool: 'rect', label: 'Box', key: 'r', icon: Square },
  { tool: 'ellipse', label: 'Circle', key: 'o', icon: Circle },
  { tool: 'arrow', label: 'Arrow', key: 'a', icon: ArrowUpRight },
  { tool: 'pen', label: 'Draw', key: 'p', icon: Pencil },
  { tool: 'pin', label: 'Pin', key: 'n', icon: MapPin },
]

const newId = () => Math.random().toString(36).slice(2, 10)
const clamp = (v: number) => Math.min(Math.max(v, 0), 1)

export function Toolbar({ tool, setTool, color, setColor }: { tool: Tool; setTool: (t: Tool) => void; color: string; setColor: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
      {TOOLS.map(({ tool: t, label, key, icon: Icon }) => (
        <Tooltip key={t}>
          <TooltipTrigger asChild>
            <Button variant={tool === t ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setTool(t)} aria-label={label}>
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
          className={cn('size-5 rounded-full border border-border transition-transform', color === c && 'scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background')}
          style={{ background: c }}
        />
      ))}
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
    if (tool === 'select') return onSelect(null)
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
      className={cn('size-full touch-none select-none', tool === 'select' ? 'cursor-default' : 'cursor-crosshair')}
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
