import { LocateFixed, Maximize, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { MarkedImage } from '@/components/marks'
import { Button } from '@/components/ui/button'
import type { Annotation } from '@/lib/api'
import { cn } from '@/lib/utils'

export type Panel = { caption?: string; src: string; width: number; height: number; annotations: Annotation[] }

// Space around the images when fitted, between them, and for captions, in
// screen pixels. The gap between images is in image pixels so it scales.
const PAD = 24
const CAPTION = 28
const GAP = 48
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const STEP = 1.25
// How much of the remaining distance each frame covers when gliding to a new view.
const EASE = 0.25
// How long the view has to sit still before the images are redrawn sharp.
const SETTLE_MS = 150

type View = { zoom: number; x: number; y: number }

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
const close = (a: View, b: View) => Math.abs(a.zoom - b.zoom) < a.zoom * 0.001 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

// Images side by side on one surface that zooms and pans as a whole, so the
// same spot in each stays lined up.
//
// Smoothness: while the view moves, the drawn images are only shifted and
// scaled as one picture (cheap for the browser). Once the view sits still,
// they're redrawn at the new size so they're sharp again.
export function ZoomCanvas({ panels, className }: { panels: Panel[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  // `view` is what the images are drawn at; `live` is what's on screen now;
  // `target` is where the view is gliding to.
  const [view, setView] = useState<View | null>(null)
  const drawn = useRef<View | null>(null)
  const live = useRef<View | null>(null)
  const target = useRef<View | null>(null)
  const frame = useRef(0)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // Until the person zooms or pans, the images re-fit when the area resizes.
  const touched = useRef(false)

  const contentWidth = panels.reduce((sum, p) => sum + p.width, 0) + GAP * (panels.length - 1)
  const contentHeight = Math.max(...panels.map((p) => p.height))
  const top = panels.some((p) => p.caption) ? CAPTION : 0

  const paint = useCallback(() => {
    const d = drawn.current
    const l = live.current
    if (!d || !l || !layer.current) return
    const k = l.zoom / d.zoom
    const tx = l.x - k * d.x
    const ty = l.y - top - k * (d.y - top)
    const still = Math.abs(k - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01
    layer.current.style.transform = still ? '' : `translate(${tx}px, ${ty}px) scale(${k})`
    layer.current.style.willChange = still ? '' : 'transform'
    if (label.current) label.current.textContent = `${Math.round(l.zoom * 100)}%`
  }, [top])

  const redrawSoon = useCallback(() => {
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      if (drag.current || !live.current) return
      setView({ ...live.current })
    }, SETTLE_MS)
  }, [])

  const tick = useCallback(() => {
    frame.current = 0
    const l = live.current
    const t = target.current
    if (!l || !t) return
    if (close(l, t)) {
      live.current = { ...t }
    } else {
      // Glide zoom on a log scale, so zooming in and out feel the same speed.
      const zoom = Math.exp(Math.log(l.zoom) + (Math.log(t.zoom) - Math.log(l.zoom)) * EASE)
      live.current = { zoom, x: l.x + (t.x - l.x) * EASE, y: l.y + (t.y - l.y) * EASE }
      frame.current = requestAnimationFrame(tick)
    }
    paint()
    if (!frame.current) redrawSoon()
  }, [paint, redrawSoon])

  const moveTo = useCallback(
    (next: View, glide = true) => {
      clearTimeout(settle.current)
      target.current = next
      if (!glide) live.current = { ...next }
      if (!frame.current) frame.current = requestAnimationFrame(tick)
    },
    [tick],
  )

  // Redrawn at a new size: the shift-and-scale is no longer needed.
  useLayoutEffect(() => {
    drawn.current = view
    paint()
  }, [view, paint])

  useEffect(() => () => (cancelAnimationFrame(frame.current), clearTimeout(settle.current)), [])

  const fitted = useCallback((): View | null => {
    const el = box.current
    if (!el) return null
    const { width, height } = el.getBoundingClientRect()
    const zoom = clamp(Math.min((width - 2 * PAD) / contentWidth, (height - 2 * PAD - top) / contentHeight))
    return { zoom, x: (width - contentWidth * zoom) / 2, y: (height - top - contentHeight * zoom) / 2 + top }
  }, [contentWidth, contentHeight, top])

  const fit = useCallback(() => {
    const next = fitted()
    if (next) moveTo(next)
  }, [fitted, moveTo])

  // Back to the middle, keeping the zoom.
  const center = useCallback(() => {
    const el = box.current
    const t = target.current
    if (!el || !t) return
    const { width, height } = el.getBoundingClientRect()
    moveTo({ ...t, x: (width - contentWidth * t.zoom) / 2, y: (height - top - contentHeight * t.zoom) / 2 + top })
  }, [contentWidth, contentHeight, top, moveTo])

  // New images, or the area resized before the person moved anything: fit straight away.
  const snapToFit = useCallback(() => {
    const next = fitted()
    if (!next) return
    target.current = next
    live.current = { ...next }
    setView(next)
  }, [fitted])

  const key = panels.map((p) => p.src).join('|')
  useLayoutEffect(() => {
    touched.current = false
    snapToFit()
  }, [key, snapToFit])
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => !touched.current && snapToFit())
    observer.observe(el)
    return () => observer.disconnect()
  }, [snapToFit])

  // Zoom keeping the point under (px, py) in place. Steps add up from where
  // the view is heading, so quick wheel clicks don't get lost mid-glide.
  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number, glide = true) => {
      const el = box.current
      const t = target.current
      if (!el || !t) return
      touched.current = true
      const rect = el.getBoundingClientRect()
      const x = px ?? rect.width / 2
      const y = py ?? rect.height / 2
      const zoom = clamp(t.zoom * factor)
      const k = zoom / t.zoom
      moveTo({ zoom, x: x - (x - t.x) * k, y: y - (y - t.y) * k }, glide)
    },
    [moveTo],
  )

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const t = target.current
      const l = live.current
      if (!t || !l) return
      touched.current = true
      target.current = { ...t, x: t.x + dx, y: t.y + dy }
      live.current = { ...l, x: l.x + dx, y: l.y + dy }
      moveTo(target.current, true)
    },
    [moveTo],
  )

  // Pinch (which browsers send as Ctrl + scroll) or ⌘/Ctrl + scroll zooms; plain scrolling pans.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) {
        // A trackpad pinch sends many small steps and should follow the
        // fingers exactly; a mouse wheel sends a few big ones, which glide.
        const pinch = Math.abs(event.deltaY) < 15 && event.deltaMode === 0
        const step = Math.max(-40, Math.min(40, event.deltaY))
        zoomAt(Math.exp(-step * (pinch ? 0.012 : 0.006)), event.clientX - rect.left, event.clientY - rect.top, !pinch)
      } else {
        panBy(-event.deltaX, -event.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, panBy])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '=' || event.key === '+') zoomAt(STEP)
      if (event.key === '-') zoomAt(1 / STEP)
      if (event.key === '0') fit()
      if (event.key === 'c') center()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomAt, fit, center])

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY }
    setDragging(true)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    if (!start) return
    drag.current = { x: event.clientX, y: event.clientY }
    panBy(event.clientX - start.x, event.clientY - start.y)
  }
  const onPointerUp = () => {
    drag.current = null
    setDragging(false)
    redrawSoon()
  }

  let left = 0
  const placed = panels.map((panel) => {
    const at = left
    left += panel.width + GAP
    return { panel, at }
  })

  return (
    <div
      ref={box}
      className={cn('relative touch-none overflow-hidden select-none', dragging ? 'cursor-grabbing' : 'cursor-grab', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        zoomAt(2, event.clientX - rect.left, event.clientY - rect.top)
      }}
    >
      <div ref={layer} className="absolute inset-0 origin-top-left">
        {view &&
          placed.map(({ panel, at }) => (
            <div key={panel.src} className="absolute" style={{ left: view.x + at * view.zoom, top: view.y - top }}>
              {panel.caption && (
                <div className="h-7 truncate text-xs text-muted-foreground" style={{ width: Math.max(panel.width * view.zoom, 120) }}>
                  {panel.caption}
                </div>
              )}
              <MarkedImage
                src={panel.src}
                width={panel.width}
                height={panel.height}
                annotations={panel.annotations}
                className="block shadow-sm ring-1 ring-border"
                size={{ width: panel.width * view.zoom, height: panel.height * view.zoom }}
              />
            </div>
          ))}
      </div>
      <div
        className="absolute right-3 bottom-3 z-10 flex items-center gap-1 rounded-lg border bg-background/95 p-1 shadow-sm backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out (-)" title="Zoom out (-)" onClick={() => zoomAt(1 / STEP)}>
          <Minus />
        </Button>
        {/* Filled in by paint(), so it keeps up with the view between redraws. */}
        <span ref={label} className="w-12 text-center text-xs tabular-nums text-muted-foreground" />
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in (+)" title="Zoom in (+)" onClick={() => zoomAt(STEP)}>
          <Plus />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Center (c)" title="Center (c)" onClick={center}>
          <LocateFixed />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Fit (0)" title="Fit (0)" onClick={fit}>
          <Maximize />
        </Button>
      </div>
    </div>
  )
}
