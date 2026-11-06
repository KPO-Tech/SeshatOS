import type { ComponentType, CSSProperties } from 'react'
import { createContext, useContext } from 'react'
import { DEFAULT_ACCENT, DESIGN_LIMITS, readableOn, safeColor } from '../../lang/design'
import { isNode } from '../../lang/parseUi'
import { finite, strings, text } from '../charts/readers'
import { RichIcon } from '../icons/RichIcon'
import type { ComponentProps } from '../NodeView'
import { NodeList } from '../NodeView'

// The design pieces of an answer (ADR 0016): the parts of a page (a window, a navigation bar, a hero, a grid of features, a palette) with
// which a model sketches what a site could look like. A colour is a validated hex code; every other look comes from the pieces.

/** The colours of the page a piece is drawn on: a piece of text takes the one that reads on it. */
type Page = { bg: string; fg: string; muted: string }
const PAGE: Page = { bg: '#ffffff', fg: '#111827', muted: 'color-mix(in srgb, #111827 62%, transparent)' }
const PageContext = createContext<Page>(PAGE)

const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`
const accentOf = (value: unknown) => safeColor(value) ?? DEFAULT_ACCENT

function Browser({ props }: ComponentProps) {
  const bg = safeColor(props.bg) ?? '#ffffff'
  const fg = readableOn(bg)
  const page: Page = { bg, fg, muted: mix(fg, 62) }
  const url = text(props.url)
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-app-border-subtle shadow-sm">
      <div className="flex items-center gap-3 border-0 border-b border-solid border-app-border-subtle bg-app-surface-elevated px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md bg-app-surface px-3 py-1 text-center text-[12px] text-app-text-muted">{url ?? ' '}</span>
      </div>
      <div style={{ background: bg, color: fg }}>
        <PageContext.Provider value={page}>
          <NodeList nodes={props.children} />
        </PageContext.Provider>
      </div>
    </div>
  )
}

function SiteButton({ label, color, kind }: { label: string; color: string; kind: 'solid' | 'outline' }) {
  const style: CSSProperties = kind === 'solid' ? { background: color, color: readableOn(color) } : { border: `1.5px solid ${color}`, color }
  return (
    <span className="inline-flex items-center rounded-full px-4 py-1.5 text-[13px] font-semibold" style={style}>
      {label}
    </span>
  )
}

function Nav({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const color = accentOf(props.color)
  const links = strings(props.links).slice(0, DESIGN_LIMITS.links)
  const cta = text(props.cta)
  return (
    <nav className="flex items-center justify-between gap-4 px-5 py-3.5" style={{ borderBottom: `1px solid ${mix(page.fg, 12)}` }}>
      <span className="text-[15px] font-bold" style={{ color: page.fg }}>
        {String(props.brand ?? '')}
      </span>
      <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]" style={{ color: page.muted }}>
        {links.map((link, index) => (
          <span key={index}>{link}</span>
        ))}
        {cta && <SiteButton label={cta} color={color} kind="solid" />}
      </span>
    </nav>
  )
}

function Hero({ props }: ComponentProps) {
  const color = accentOf(props.color)
  const ink = readableOn(color)
  const center = props.align !== 'left'
  const primary = text(props.primary)
  const secondary = text(props.secondary)
  const subtitle = text(props.subtitle)
  return (
    <div
      className={`flex flex-col gap-3 px-6 py-12 ${center ? 'items-center text-center' : 'items-start text-left'}`}
      style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, #000))`, color: ink }}
    >
      <div className="max-w-[34rem] text-[30px] font-extrabold leading-tight tracking-tight">{String(props.title ?? '')}</div>
      {subtitle && <div className="max-w-[30rem] text-[15px] leading-relaxed" style={{ opacity: 0.88 }}>{subtitle}</div>}
      {(primary || secondary) && (
        <div className="mt-2 flex flex-wrap gap-2.5">
          {primary && <SiteButton label={primary} color={ink} kind="solid" />}
          {secondary && <SiteButton label={secondary} color={ink} kind="outline" />}
        </div>
      )}
    </div>
  )
}

function Features({ props }: ComponentProps) {
  const items = (Array.isArray(props.items) ? props.items : []).filter(isNode).slice(0, DESIGN_LIMITS.features)
  const columns = Math.min(DESIGN_LIMITS.columns, Math.max(1, Math.round(finite(props.columns) ?? Math.min(3, items.length || 1))))
  return (
    <div className="grid gap-3.5 p-5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(36 / columns)}rem), 1fr))` }}>
      <NodeList nodes={items} />
    </div>
  )
}

function Feature({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const color = accentOf(props.color)
  const body = text(props.text)
  return (
    <div className="flex flex-col gap-2 rounded-xl p-4" style={{ background: mix(color, 9), border: `1px solid ${mix(color, 28)}` }}>
      {text(props.icon) && (
        <span className="inline-flex size-9 items-center justify-center rounded-lg" style={{ background: mix(color, 20), color }}>
          <RichIcon name={text(props.icon)} size={18} />
        </span>
      )}
      <div className="text-[14px] font-semibold" style={{ color: page.fg }}>
        {String(props.title ?? '')}
      </div>
      {body && (
        <div className="text-[13px] leading-relaxed" style={{ color: page.muted }}>
          {body}
        </div>
      )}
    </div>
  )
}

function Grid({ props }: ComponentProps) {
  const columns = Math.min(DESIGN_LIMITS.columns, Math.max(1, Math.round(finite(props.columns) ?? 2)))
  return (
    <div className="grid gap-3.5 p-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      <NodeList nodes={props.children} />
    </div>
  )
}

function Picture({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const color = accentOf(props.color)
  const ratio = Math.min(3, Math.max(0.5, finite(props.ratio) ?? 1.6))
  const label = text(props.label)
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden rounded-xl text-[12.5px] font-medium"
      style={{
        aspectRatio: String(ratio),
        background: `radial-gradient(circle at 25% 20%, ${mix('#ffffff', 35)}, transparent 55%), linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, ${page.bg}))`,
        color: readableOn(color)
      }}
    >
      {label}
    </div>
  )
}

function Palette({ props }: ComponentProps) {
  const swatches = (Array.isArray(props.swatches) ? props.swatches : []).filter(isNode).slice(0, DESIGN_LIMITS.swatches)
  return (
    <div className="my-3">
      {text(props.title) && <div className="mb-2 text-[13px] font-semibold text-app-text">{text(props.title)}</div>}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(6.5rem, 1fr))' }}>
        {swatches.map((swatch, index) => {
          const color = safeColor(swatch.props.color)
          if (!color) return null
          return (
            <div key={index} className="overflow-hidden rounded-xl border border-app-border-subtle bg-app-surface">
              <div className="h-14" style={{ background: color }} />
              <div className="px-2.5 py-2">
                <div className="truncate text-[12.5px] font-medium text-app-text">{text(swatch.props.name) ?? color}</div>
                <div className="text-[11.5px] uppercase tabular-nums text-app-text-muted">{color}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Footer({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const links = strings(props.links).slice(0, DESIGN_LIMITS.links)
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-[12.5px]" style={{ borderTop: `1px solid ${mix(page.fg, 12)}`, color: page.muted }}>
      <span>{String(props.text ?? '')}</span>
      <span className="flex flex-wrap gap-4">
        {links.map((link, index) => (
          <span key={index}>{link}</span>
        ))}
      </span>
    </footer>
  )
}

/** A Feature or a Swatch is read by the piece that holds it. */
function ReadByParent() {
  return null
}

export const designComponents: Record<string, ComponentType<ComponentProps>> = { Browser, Nav, Hero, Features, Feature, Grid, Picture, Palette, Swatch: ReadByParent, Footer }
