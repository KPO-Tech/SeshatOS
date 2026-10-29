import { useState, type MouseEvent } from 'react'
import type { PlotArea } from './Axes'

export type Hover = { px: number; heading: string; rows: Array<{ label: string; value: string; accent: string }> }

/** What is under the pointer: `locate` turns a position (in SVG pixels) into what to show, or null outside the data. */
export function useCrosshair(locate: (px: number) => Hover | null) {
  const [hover, setHover] = useState<Hover | null>(null)
  return {
    hover,
    onMove: (event: MouseEvent<SVGRectElement>) => {
      const svg = event.currentTarget.ownerSVGElement
      if (!svg) return
      setHover(locate(event.clientX - svg.getBoundingClientRect().left))
    },
    onLeave: () => setHover(null)
  }
}

type OverlayProps = { area: PlotArea; hover: Hover | null; onMove: (event: MouseEvent<SVGRectElement>) => void; onLeave: () => void }

/** A transparent layer over the data that follows the pointer, and the vertical line at the place it shows. */
export function CrosshairOverlay({ area, hover, onMove, onLeave }: OverlayProps) {
  return (
    <g>
      {hover && <line x1={hover.px} x2={hover.px} y1={area.top} y2={area.top + area.height} className="stroke-app-text-muted" strokeWidth="1" strokeDasharray="3 3" pointerEvents="none" />}
      <rect x={area.left} y={area.top} width={area.width} height={area.height} fill="transparent" onMouseMove={onMove} onMouseLeave={onLeave} />
    </g>
  )
}

/** The small card with the values at the place shown. It stays inside the chart: on the left of the line past the middle. */
export function CrosshairTip({ hover, width, top }: { hover: Hover | null; width: number; top: number }) {
  if (!hover) return null
  const flip = hover.px > width / 2
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[110px] rounded-md border border-app-border bg-app-surface-elevated px-2.5 py-1.5 text-[11.5px] shadow-[var(--shadow-medium)]"
      style={{ left: hover.px, top: top + 6, transform: `translateX(${flip ? 'calc(-100% - 10px)' : '10px'})` }}
    >
      <div className="mb-0.5 font-semibold text-app-text">{hover.heading}</div>
      {hover.rows.map((row, index) => (
        <div key={index} className="flex items-center justify-between gap-3 text-app-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-full bg-current ${row.accent}`} />
            {row.label}
          </span>
          <span className="font-medium tabular-nums text-app-text">{row.value}</span>
        </div>
      ))}
    </div>
  )
}
