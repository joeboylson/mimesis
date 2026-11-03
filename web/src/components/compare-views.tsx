import { Columns2, Layers, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PICKED } from '@/components/annotator'
import { MarkedImage } from '@/components/marks'
import { Button } from '@/components/ui/button'
import { ZoomCanvas } from '@/components/zoom-canvas'
import { imageUrl, type Annotation, type Round } from '@/lib/api'
import { cn } from '@/lib/utils'

// Three ways to compare the last round with the new one:
//   side    next to each other, the last one with your marks
//   overlay the new one on top of the last, see-through by a slider
//   flicker swapping between the two, to make small changes jump out
export type CompareView = 'side' | 'overlay' | 'flicker'

export const FLICKER_MS = [200, 400, 600] as const

const VIEWS: { view: CompareView; label: string; icon: typeof Layers }[] = [
  { view: 'side', label: 'Side by side', icon: Columns2 },
  { view: 'overlay', label: 'Overlay', icon: Layers },
  { view: 'flicker', label: 'Flicker', icon: Zap },
]

export function CompareBar({
  view,
  setView,
  opacity,
  setOpacity,
  flickerMs,
  setFlickerMs,
}: {
  view: CompareView
  setView: (view: CompareView) => void
  opacity: number
  setOpacity: (opacity: number) => void
  flickerMs: number
  setFlickerMs: (ms: number) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur">
      {VIEWS.map(({ view: v, label, icon: Icon }) => (
        <Button key={v} variant="ghost" size="sm" aria-pressed={view === v} onClick={() => setView(v)} className={cn('relative', view === v && PICKED)}>
          <Icon />
          {label}
        </Button>
      ))}
      {view === 'overlay' && (
        <label className="ml-1 flex items-center gap-2 border-l pr-2 pl-3 text-xs text-muted-foreground">
          Last round
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            aria-label="How much of the new version shows"
            className="w-32 accent-foreground"
          />
          New
        </label>
      )}
      {view === 'flicker' && (
        <div className="ml-1 flex items-center gap-1 border-l pl-2">
          {FLICKER_MS.map((ms) => (
            <Button key={ms} variant="ghost" size="sm" aria-pressed={flickerMs === ms} onClick={() => setFlickerMs(ms)} className={cn('relative tabular-nums', flickerMs === ms && PICKED)}>
              {ms} ms
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CompareCanvas({
  previous,
  round,
  annotations,
  view,
  opacity,
  flickerMs,
  fitKey,
  className,
  insetTop,
}: {
  previous: Round
  round: Round
  annotations: Annotation[]
  view: CompareView
  opacity: number
  flickerMs: number
  fitKey: number
  className?: string
  insetTop: number
}) {
  const [showNew, setShowNew] = useState(true)
  useEffect(() => {
    if (view !== 'flicker') return
    const timer = setInterval(() => setShowNew((s) => !s), flickerMs)
    return () => clearInterval(timer)
  }, [view, flickerMs])

  if (view === 'side') {
    return (
      <ZoomCanvas
        className={className}
        insetTop={insetTop}
        fitKey={fitKey}
        panels={[
          { caption: `Round ${previous.number}: your marks`, src: imageUrl(previous.image), width: previous.width, height: previous.height, annotations: previous.annotations },
          { caption: `Round ${round.number}: new version`, src: imageUrl(round.image), width: round.width, height: round.height, annotations },
        ]}
      />
    )
  }

  // Overlay and flicker stack both images at the same scale, top-left aligned,
  // with no marks on top, so only the real differences show.
  const width = Math.max(previous.width, round.width)
  const height = Math.max(previous.height, round.height)
  const caption = view === 'overlay' ? `Round ${round.number} over round ${previous.number}` : `Showing round ${showNew ? round.number : previous.number}`
  return (
    <ZoomCanvas
      className={className}
      insetTop={insetTop}
      fitKey={fitKey}
      panels={[
        {
          caption,
          src: `${imageUrl(previous.image)}|${imageUrl(round.image)}`,
          width,
          height,
          annotations: [],
          render: (size) => {
            const zoom = size.width / width
            const sized = (r: Round) => ({ width: r.width * zoom, height: r.height * zoom })
            const newOn = view === 'overlay' ? opacity : showNew ? 1 : 0
            return (
              <div className="relative bg-background" style={size}>
                <MarkedImage src={imageUrl(previous.image)} width={previous.width} height={previous.height} annotations={[]} className="absolute top-0 left-0 block" size={sized(previous)} />
                <div className="absolute top-0 left-0" style={{ opacity: newOn }}>
                  <MarkedImage src={imageUrl(round.image)} width={round.width} height={round.height} annotations={[]} className="block" size={sized(round)} />
                </div>
              </div>
            )
          },
        },
      ]}
    />
  )
}
