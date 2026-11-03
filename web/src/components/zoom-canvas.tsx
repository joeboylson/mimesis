import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { MarkedImage } from '@/components/marks'
import type { Annotation } from '@/lib/api'
import { cn } from '@/lib/utils'

export type Size = { width: number; height: number }

// `render` draws something other than a plain marked image at the given size
// (the mark-up view puts the drawing surface there).
export type Panel = { caption?: string; src: string; width: number; height: number; annotations: Annotation[]; render?: (size: Size) => ReactNode }

// Space around the images when fitted, and for captions, in screen pixels.
// The gap between images is in image pixels so it scales.
const PAD = 24
const CAPTION = 28
const GAP = 48
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
// How much of the remaining distance each frame covers when gliding to a new view.
const EASE = 0.25
// How long the view has to sit still before the images are redrawn sharp.
const SETTLE_MS = 150

type View = { zoom: number; x: number; y: number }

const clamp = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
const close = (a: View, b: View) => Math.abs(a.zoom - b.zoom) < a.zoom * 0.001 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5

// Images side by side on one surface: scroll to zoom, drag to move around.
// They move as one, so the same spot in each stays lined up.
//
// `canDrag` is off while a drawing tool is picked, so a drag draws instead.
// Changing `fitKey` fits the images back on screen.
//
// Smoothness: while the view moves, the drawn images are only shifted and
// scaled as one picture (cheap for the browser). Once the view sits still,
// they're redrawn at the new size so they're sharp again.
export function ZoomCanvas({
  panels,
  className,
  insetTop = 0,
  canDrag = true,
  fitKey = 0,
}: {
  panels: Panel[]
  className?: string
  insetTop?: number
  canDrag?: boolean
  fitKey?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  // `view` is what the images are drawn at; `live` is what's on screen now;
  // `target` is where the view is gliding to. `x`/`y` are the images' top-left.
  const [view, setView] = useState<View | null>(null)
  const drawn = useRef<View | null>(null)
  const live = useRef<View | null>(null)
  const target = useRef<View | null>(null)
  const frame = useRef(0)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  // Until the person zooms or moves, the images re-fit when the area resizes.
  const touched = useRef(false)

  const contentWidth = panels.reduce((sum, p) => sum + p.width, 0) + GAP * (panels.length - 1)
  const contentHeight = Math.max(...panels.map((p) => p.height))
  const caption = panels.some((p) => p.caption) ? CAPTION : 0
  // Room above the images when fitted: for captions, and for anything floating over the top edge.
  const top = caption + insetTop

  const paint = useCallback(() => {
    const d = drawn.current
    const l = live.current
    if (!d || !l || !layer.current) return
    const k = l.zoom / d.zoom
    const tx = l.x - k * d.x
    const ty = l.y - k * d.y
    const still = Math.abs(k - 1) < 1e-6 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01
    layer.current.style.transform = still ? '' : `translate(${tx}px, ${ty}px) scale(${k})`
    layer.current.style.willChange = still ? '' : 'transform'
  }, [])

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

  // The Fit button: glide back.
  const lastFitKey = useRef(fitKey)
  useEffect(() => {
    if (lastFitKey.current === fitKey) return
    lastFitKey.current = fitKey
    touched.current = false
    const next = fitted()
    if (next) moveTo(next)
  }, [fitKey, fitted, moveTo])

  // Scrolling zooms around the pointer. A trackpad sends many small steps,
  // which follow the fingers exactly; a mouse wheel sends a few big ones,
  // which glide.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const t = target.current
      if (!t) return
      touched.current = true
      const rect = el.getBoundingClientRect()
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      const fine = Math.abs(delta) < 15 && event.deltaMode === 0
      const step = Math.max(-40, Math.min(40, delta))
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const zoom = clamp(t.zoom * Math.exp(-step * (fine && event.ctrlKey ? 0.012 : 0.006)))
      const k = zoom / t.zoom
      moveTo({ zoom, x: x - (x - t.x) * k, y: y - (y - t.y) * k }, !fine)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [moveTo])

  const onPointerDown = (event: React.PointerEvent) => {
    if (!canDrag || event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY }
    setDragging(true)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current
    const t = target.current
    const l = live.current
    if (!start || !t || !l) return
    touched.current = true
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    drag.current = { x: event.clientX, y: event.clientY }
    target.current = { ...t, x: t.x + dx, y: t.y + dy }
    live.current = { ...l, x: l.x + dx, y: l.y + dy }
    moveTo(target.current, false)
  }
  const onPointerUp = () => {
    if (!drag.current) return
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
      className={cn('relative touch-none overflow-hidden select-none', canDrag && (dragging ? 'cursor-grabbing' : 'cursor-grab'), className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={layer} className="absolute inset-0 origin-top-left">
        {view &&
          placed.map(({ panel, at }) => (
            <div key={panel.src} className="absolute" style={{ left: view.x + at * view.zoom, top: view.y - caption }}>
              {panel.caption && (
                <div className="h-7 truncate text-xs text-muted-foreground" style={{ width: Math.max(panel.width * view.zoom, 120) }}>
                  {panel.caption}
                </div>
              )}
              {panel.render ? (
                <div className="shadow-sm ring-1 ring-border">{panel.render({ width: panel.width * view.zoom, height: panel.height * view.zoom })}</div>
              ) : (
                <MarkedImage
                  src={panel.src}
                  width={panel.width}
                  height={panel.height}
                  annotations={panel.annotations}
                  className="block shadow-sm ring-1 ring-border"
                  size={{ width: panel.width * view.zoom, height: panel.height * view.zoom }}
                />
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
