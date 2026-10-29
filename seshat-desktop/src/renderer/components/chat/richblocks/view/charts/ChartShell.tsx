import type { ReactNode } from 'react'
import { useElementWidth } from './useElementWidth'

export type LegendItem = { label: string; accent: string; dashed?: boolean; swatch?: 'line' | 'box' | 'dot' }

type Props = {
  title?: string
  legend?: LegendItem[]
  /** Height as a share of the width, within the two limits. */
  ratio?: number
  minHeight?: number
  maxHeight?: number
  children: (size: { width: number; height: number }) => ReactNode
}

function Swatch({ item }: { item: LegendItem }) {
  if (item.swatch === 'box') return <span className={`inline-block size-2.5 rounded-sm bg-current ${item.accent}`} />
  if (item.swatch === 'dot') return <span className={`inline-block size-2 rounded-full bg-current ${item.accent}`} />
  return (
    <svg width="16" height="8" aria-hidden="true" className={item.accent}>
      <line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={item.dashed ? '4 3' : undefined} strokeLinecap="round" />
    </svg>
  )
}

/** The frame of a chart: a title, a legend, and a drawing area that is told its width and gives back an SVG of that size. */
export function ChartShell({ title, legend, ratio = 0.5, minHeight = 220, maxHeight = 400, children }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const height = Math.round(Math.min(maxHeight, Math.max(minHeight, width * ratio)))
  return (
    <figure className="m-0 my-3 rounded-lg border border-app-border-subtle bg-app-surface p-3">
      {title && <figcaption className="mb-1.5 text-[13px] font-semibold text-app-text">{title}</figcaption>}
      {legend && legend.length > 0 && (
        <ul className="m-0 mb-1.5 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[11.5px] text-app-text-secondary">
          {legend.map((item, index) => (
            <li key={index} className="flex items-center gap-1.5">
              <Swatch item={item} />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative">
        {/* Always called, so the hooks a chart uses are called the same number of times at every width. */}
        {children({ width, height })}
      </div>
    </figure>
  )
}
