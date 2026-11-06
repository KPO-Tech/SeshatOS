import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { DEFAULT_ACCENT, DESIGN_LIMITS, FONT_STACKS, FONTS, RADII, RADIUS_REM, fillCss, readableOn, safeColor, safeFill, type FontName, type RadiusName } from '../../lang/design'
import { isNode } from '../../lang/parseUi'
import { finite, strings, text } from '../charts/readers'
import { RichIcon } from '../icons/RichIcon'
import { resolveIcon } from '../icons/iconCatalog'
import type { ComponentProps } from '../NodeView'
import { NodeList } from '../NodeView'

// The design pieces of an answer (ADR 0016): the parts of a page (a window, a phone, a navigation bar, a hero, cards, prices, a palette) with
// which a model sketches what a site could look like. A colour is read by safeColor and safeFill and reaches a style only as #rrggbb; a font
// and a radius are chosen from short lists; every other look comes from the pieces.

/** The page a piece is drawn on: its colours, so that a text takes the one that reads on it, its font and its corners. */
type Page = { bg: string; fg: string; muted: string; font: string; radius: string }
const mix = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`
const PAGE: Page = { bg: '#ffffff', fg: '#111827', muted: mix('#111827', 62), font: FONT_STACKS.sans, radius: RADIUS_REM.md }
const PageContext = createContext<Page>(PAGE)

const accentOf = (value: unknown) => safeFill(value) ?? { base: DEFAULT_ACCENT, stops: [DEFAULT_ACCENT] }
const choice = <T extends string>(value: unknown, list: readonly T[], fallback: T): T => (typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback)

function pageOf(props: Record<string, unknown>): Page {
  const fill = safeFill(props.bg) ?? { base: '#ffffff', stops: ['#ffffff'] }
  const fg = readableOn(fill.base)
  return {
    bg: fillCss(fill),
    fg,
    muted: mix(fg, 62),
    font: FONT_STACKS[choice<FontName>(props.font, FONTS, 'sans')],
    radius: RADIUS_REM[choice<RadiusName>(props.radius, RADII, 'md')]
  }
}

function Browser({ props }: ComponentProps) {
  const page = pageOf(props)
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
      <div style={{ background: page.bg, color: page.fg, fontFamily: page.font }}>
        <PageContext.Provider value={page}>
          <NodeList nodes={props.children} />
        </PageContext.Provider>
      </div>
    </div>
  )
}

function Phone({ props }: ComponentProps) {
  const page = pageOf(props)
  return (
    <div className="mx-auto my-3 w-full max-w-[22rem] rounded-[2.2rem] border-[7px] border-solid border-[#1f2937] bg-[#1f2937] shadow-md">
      <div className="mx-auto -mb-3 h-5 w-28 rounded-b-2xl bg-[#1f2937]" aria-hidden="true" />
      <div className="overflow-hidden rounded-[1.7rem]" style={{ background: page.bg, color: page.fg, fontFamily: page.font }}>
        <PageContext.Provider value={page}>
          <NodeList nodes={props.children} />
        </PageContext.Provider>
      </div>
    </div>
  )
}

function SiteButton({ label, fill, kind }: { label: string; fill: { base: string; stops: string[] }; kind: 'solid' | 'outline' }) {
  const page = useContext(PageContext)
  const style: CSSProperties =
    kind === 'solid' ? { background: fillCss(fill), color: readableOn(fill.base), borderRadius: page.radius } : { border: `1.5px solid ${fill.base}`, color: fill.base, borderRadius: page.radius }
  return (
    <span className="inline-flex items-center px-4 py-1.5 text-[13px] font-semibold" style={style}>
      {label}
    </span>
  )
}

function Cta({ props }: ComponentProps) {
  return (
    <span className="m-1 inline-flex">
      <SiteButton label={String(props.label ?? '')} fill={accentOf(props.color)} kind={props.variant === 'outline' ? 'outline' : 'solid'} />
    </span>
  )
}

function Nav({ props }: ComponentProps) {
  const page = useContext(PageContext)
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
        {cta && <SiteButton label={cta} fill={accentOf(props.color)} kind="solid" />}
      </span>
    </nav>
  )
}

function Hero({ props }: ComponentProps) {
  const fill = accentOf(props.color)
  const background = fill.stops.length > 1 ? fillCss(fill) : `linear-gradient(135deg, ${fill.base}, color-mix(in srgb, ${fill.base} 62%, #000))`
  const ink = readableOn(fill.stops[fill.stops.length > 1 ? Math.floor(fill.stops.length / 2) : 0])
  const center = props.align !== 'left'
  const primary = text(props.primary)
  const secondary = text(props.secondary)
  const subtitle = text(props.subtitle)
  const inkFill = { base: ink, stops: [ink] }
  return (
    <div className={`flex flex-col gap-3 px-6 py-12 ${center ? 'items-center text-center' : 'items-start text-left'}`} style={{ background, color: ink }}>
      <div className="max-w-[34rem] text-[30px] font-extrabold leading-tight tracking-tight">{String(props.title ?? '')}</div>
      {subtitle && (
        <div className="max-w-[30rem] text-[15px] leading-relaxed" style={{ opacity: 0.88 }}>
          {subtitle}
        </div>
      )}
      {(primary || secondary) && (
        <div className="mt-2 flex flex-wrap gap-2.5">
          {primary && <SiteButton label={primary} fill={inkFill} kind="solid" />}
          {secondary && <SiteButton label={secondary} fill={inkFill} kind="outline" />}
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
  const color = accentOf(props.color).base
  const body = text(props.text)
  return (
    <div className="flex flex-col gap-2 p-4" style={{ background: mix(color, 9), border: `1px solid ${mix(color, 28)}`, borderRadius: page.radius }}>
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
  const fill = accentOf(props.color)
  const ratio = Math.min(3, Math.max(0.5, finite(props.ratio) ?? 1.6))
  const base = fill.stops.length > 1 ? fillCss(fill) : `linear-gradient(135deg, ${fill.base}, color-mix(in srgb, ${fill.base} 55%, ${page.fg === '#ffffff' ? '#000' : '#fff'}))`
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden text-[12.5px] font-medium"
      style={{ aspectRatio: String(ratio), background: `radial-gradient(circle at 25% 20%, ${mix('#ffffff', 35)}, transparent 55%), ${base}`, color: readableOn(fill.base), borderRadius: page.radius }}
    >
      {text(props.label)}
    </div>
  )
}

function Avatar({ props }: ComponentProps) {
  const fill = accentOf(props.color)
  const initials = String(props.name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold" style={{ background: fillCss(fill), color: readableOn(fill.base) }} aria-label={String(props.name ?? '')}>
      {initials}
    </span>
  )
}

function Testimonial({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const role = text(props.role)
  return (
    <figure className="mx-5 my-4 flex flex-col gap-3 p-5" style={{ border: `1px solid ${mix(page.fg, 14)}`, borderRadius: page.radius }}>
      <blockquote className="m-0 border-0 p-0 text-[14.5px] italic leading-relaxed" style={{ color: page.fg }}>
        {`“${String(props.quote ?? '')}”`}
      </blockquote>
      <figcaption className="flex items-center gap-2.5">
        <Avatar props={{ name: props.author, color: props.color }} />
        <span className="flex flex-col text-[12.5px] leading-tight">
          <span className="font-semibold" style={{ color: page.fg }}>
            {String(props.author ?? '')}
          </span>
          {role && <span style={{ color: page.muted }}>{role}</span>}
        </span>
      </figcaption>
    </figure>
  )
}

function Stats({ props }: ComponentProps) {
  const items = (Array.isArray(props.items) ? props.items : []).filter(isNode).slice(0, DESIGN_LIMITS.stats)
  const page = useContext(PageContext)
  return (
    <div className="grid gap-4 px-5 py-6 text-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))' }}>
      {items.map((item, index) => (
        <div key={index}>
          <div className="text-[28px] font-extrabold leading-none tracking-tight" style={{ color: page.fg }}>
            {String(item.props.value ?? '')}
          </div>
          <div className="mt-1 text-[12.5px]" style={{ color: page.muted }}>
            {String(item.props.label ?? '')}
          </div>
        </div>
      ))}
    </div>
  )
}

function Plans({ props }: ComponentProps) {
  const items = (Array.isArray(props.items) ? props.items : []).filter(isNode).slice(0, DESIGN_LIMITS.plans)
  return (
    <div className="grid gap-3.5 p-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}>
      <NodeList nodes={items} />
    </div>
  )
}

function Plan({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const color = accentOf(props.color)
  const featured = props.highlight === true
  const features = strings(props.features).slice(0, DESIGN_LIMITS.planFeatures)
  const cta = text(props.cta)
  return (
    <div className="flex flex-col gap-3 p-5" style={{ border: featured ? `2px solid ${color.base}` : `1px solid ${mix(page.fg, 14)}`, background: featured ? mix(color.base, 7) : undefined, borderRadius: page.radius }}>
      <div className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: featured ? color.base : page.muted }}>
        {String(props.name ?? '')}
      </div>
      <div className="text-[26px] font-extrabold leading-none" style={{ color: page.fg }}>
        {String(props.price ?? '')}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]" style={{ color: page.muted }}>
        {features.map((feature, index) => (
          <li key={index} className="flex gap-2">
            <span style={{ color: color.base }} aria-hidden="true">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
      {cta && (
        <div className="mt-auto">
          <SiteButton label={cta} fill={color} kind={featured ? 'solid' : 'outline'} />
        </div>
      )}
    </div>
  )
}

function Logos({ props }: ComponentProps) {
  const page = useContext(PageContext)
  const names = strings(props.names).slice(0, DESIGN_LIMITS.logos)
  const title = text(props.title)
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-6">
      {title && (
        <div className="text-[12px] uppercase tracking-wider" style={{ color: page.muted }}>
          {title}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-[15px] font-semibold" style={{ color: page.muted }}>
        {names.map((name, index): ReactNode => (
          <span key={index} className="inline-flex items-center gap-2">
            {resolveIcon(name) && <RichIcon name={name} size={20} />}
            {name}
          </span>
        ))}
      </div>
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
          const fill = safeFill(swatch.props.color)
          if (!fill) return null
          return (
            <div key={index} className="overflow-hidden rounded-xl border border-app-border-subtle bg-app-surface">
              <div className="h-14" style={{ background: fillCss(fill, 90) }} />
              <div className="px-2.5 py-2">
                <div className="truncate text-[12.5px] font-medium text-app-text">{text(swatch.props.name) ?? fill.base}</div>
                <div className="text-[11.5px] uppercase tabular-nums text-app-text-muted">{fill.stops.join(' → ')}</div>
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

/** A Feature, a Plan, a Stat or a Swatch is read by the piece that holds it. */
function ReadByParent() {
  return null
}

// safeColor stays imported for the colour of a swatch that is read alone.
void safeColor

export const designComponents: Record<string, ComponentType<ComponentProps>> = {
  Browser, Phone, Nav, Hero, Features, Feature, Grid, Picture, Palette, Swatch: ReadByParent, Footer, Cta, Plans, Plan, Stats, Stat: ReadByParent, Testimonial, Avatar, Logos
}
