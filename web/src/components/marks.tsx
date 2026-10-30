import type { Annotation } from '@/lib/api'

// Draws marks over an image in the image's own pixels, the same way the
// server bakes them, so what the person sees is what the AI gets.

export const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ffffff', '#171717']

export const markUnit = (width: number, height: number) => Math.max(Math.min(width, height) / 160, 2)

function anchor(a: Annotation): [number, number] {
  switch (a.kind) {
    case 'rect':
    case 'ellipse':
      return [a.x, a.y]
    case 'arrow':
      return [a.x1, a.y1]
    case 'pen':
      return a.points[0] ?? [0, 0]
    case 'pin':
      return [a.x, a.y]
  }
}

const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 153
}

function Shape({ a, w, h, unit }: { a: Annotation; w: number; h: number; unit: number }) {
  const stroke = { stroke: a.color, strokeWidth: unit * 0.6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const halo = { ...stroke, stroke: 'rgba(255,255,255,0.67)', strokeWidth: unit * 1.4 }
  const draw = (props: typeof stroke) => {
    switch (a.kind) {
      case 'rect':
        return <rect x={a.x * w} y={a.y * h} width={a.w * w} height={a.h * h} {...props} />
      case 'ellipse':
        return <ellipse cx={(a.x + a.w / 2) * w} cy={(a.y + a.h / 2) * h} rx={(a.w / 2) * w} ry={(a.h / 2) * h} {...props} />
      case 'arrow': {
        const [sx, sy, ex, ey] = [a.x1 * w, a.y1 * h, a.x2 * w, a.y2 * h]
        const angle = Math.atan2(ey - sy, ex - sx)
        const length = unit * 4.5
        const tip = [
          [ex, ey],
          [ex - length * Math.cos(angle - 0.45), ey - length * Math.sin(angle - 0.45)],
          [ex - length * Math.cos(angle + 0.45), ey - length * Math.sin(angle + 0.45)],
        ]
          .map((p) => p.join(','))
          .join(' ')
        return (
          <g>
            <line x1={sx} y1={sy} x2={ex} y2={ey} {...props} />
            <polygon points={tip} {...props} fill={props.stroke} />
          </g>
        )
      }
      case 'pen':
        return <polyline points={a.points.map(([x, y]) => `${x * w},${y * h}`).join(' ')} {...props} />
      case 'pin':
        return null
    }
  }
  return (
    <g>
      {draw(halo)}
      {draw(stroke)}
    </g>
  )
}

function NumberBadge({ a, number, w, h, unit, selected }: { a: Annotation; number: number; w: number; h: number; unit: number; selected: boolean }) {
  const r = unit * 2.6
  const [x, y] = anchor(a)
  const cx = Math.min(Math.max(x * w, r), w - r)
  const cy = Math.min(Math.max(y * h, r), h - r)
  return (
    <g>
      {selected && <circle cx={cx} cy={cy} r={r * 1.5} fill="none" stroke={a.color} strokeWidth={unit * 0.5} strokeDasharray={`${unit * 1.5} ${unit}`} />}
      <circle cx={cx} cy={cy} r={r} fill={a.color} stroke="#fff" strokeWidth={r * 0.18} />
      <text
        x={cx}
        y={cy}
        dy="0.36em"
        textAnchor="middle"
        fontSize={r * 1.15}
        fontWeight={600}
        fill={isLight(a.color) ? '#000' : '#fff'}
        style={{ fontFamily: 'Geist Variable, sans-serif', userSelect: 'none' }}
      >
        {number}
      </text>
    </g>
  )
}

export function Marks({
  annotations,
  width,
  height,
  selected = null,
  onSelect,
}: {
  annotations: Annotation[]
  width: number
  height: number
  selected?: string | null
  onSelect?: (id: string) => void
}) {
  const unit = markUnit(width, height)
  return (
    <>
      {annotations.map((a) => (
        <g
          key={a.id}
          onPointerDown={onSelect ? (e) => (e.stopPropagation(), onSelect(a.id)) : undefined}
          style={{ cursor: onSelect ? 'pointer' : undefined }}
        >
          <Shape a={a} w={width} h={height} unit={unit} />
        </g>
      ))}
      {annotations.map((a, i) => (
        <g key={`${a.id}-n`} onPointerDown={onSelect ? (e) => (e.stopPropagation(), onSelect(a.id)) : undefined} style={{ cursor: onSelect ? 'pointer' : undefined }}>
          <NumberBadge a={a} number={i + 1} w={width} h={height} unit={unit} selected={selected === a.id} />
        </g>
      ))}
    </>
  )
}

// An image with its marks on top, fitted inside its parent.
export function MarkedImage({ src, width, height, annotations, className }: { src: string; width: number; height: number; annotations: Annotation[]; className?: string }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="xMidYMid meet">
      <image href={src} width={width} height={height} />
      <Marks annotations={annotations} width={width} height={height} />
    </svg>
  )
}
