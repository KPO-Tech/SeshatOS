import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { STORE_APPS, type StoreApp } from './storeCatalog'
import { storeSections } from './storeSections'

// SeshatOS's own catalog of platforms. An app with a route opens from here
// and from the sidebar; the others are announced honestly as coming soon.
// When one lands, give it a route in storeCatalog.tsx: nothing else here changes.
export function StorePage() {
  const navigate = useNavigate()
  const { featured, available, soon } = storeSections(STORE_APPS)

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <header className="shrink-0">
        <h1 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">Store</h1>
        <p className="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">The platforms SeshatOS can host. Each one opens in its own page.</p>
      </header>

      <div className="no-scrollbar mt-5 min-h-0 flex-1 space-y-8 overflow-y-auto pb-10">
        {featured && <FeaturedApp app={featured} onOpen={featured.route ? () => navigate(featured.route!) : undefined} />}

        {available.length > 0 && (
          <Group title="Available">
            {available.map((app) => (
              <AppCard key={app.id} app={app} onOpen={() => navigate(app.route!)} />
            ))}
          </Group>
        )}

        {soon.length > 0 && (
          <Group title="Coming soon" note="Not built yet. They appear here, then in the sidebar, as they are ready.">
            {soon.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </Group>
        )}
      </div>
    </section>
  )
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{title}</h2>
      {note && <p className="mb-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">{note}</p>}
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">{children}</div>
    </div>
  )
}

function AppMark({ app, size }: { app: StoreApp; size: number }) {
  if (app.logo) {
    return <img src={app.logo} alt="" width={size} height={size} className="shrink-0 rounded-[22%]" />
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[22%] bg-[var(--accent-subtle)] text-[var(--accent-primary)]"
      style={{ width: size, height: size }}
    >
      {app.icon}
    </span>
  )
}

function SoonBadge() {
  return (
    <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
      Soon
    </span>
  )
}

function FeaturedApp({ app, onOpen }: { app: StoreApp; onOpen?: () => void }) {
  return (
    <article
      className="relative overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-6"
      style={{ backgroundImage: 'radial-gradient(60% 120% at 0% 0%, color-mix(in srgb, var(--accent-primary) 12%, transparent), transparent 70%)' }}
    >
      <div className="flex items-start gap-5">
        <AppMark app={app} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[20px] font-semibold text-[var(--text-primary)]">{app.name}</h2>
            {!onOpen && <SoonBadge />}
          </div>
          <p className="mb-0 mt-1 text-[14px] text-[var(--text-primary)]">{app.tagline}</p>
          <p className="mb-0 mt-2 max-w-[560px] text-[12.5px] leading-[19px] text-[var(--text-muted)]">{app.description}</p>
          {app.needsCloud && <p className="mb-0 mt-3 text-[12px] text-[var(--text-secondary)]">Works on the data of your organization: needs a SeshatCloud connection.</p>}
          <button
            type="button"
            disabled={!onOpen}
            onClick={onOpen}
            className="mt-4 h-9 cursor-pointer rounded-full border-0 bg-[var(--accent-primary)] px-5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-default disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-muted)] disabled:hover:brightness-100"
          >
            {onOpen ? 'Open' : 'Coming soon'}
          </button>
        </div>
      </div>
    </article>
  )
}

function AppCard({ app, onOpen }: { app: StoreApp; onOpen?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onOpen}
      onClick={onOpen}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-[var(--surface-muted)] disabled:cursor-default"
    >
      <AppMark app={app} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{app.name}</span>
        <span className="mt-0.5 line-clamp-2 break-words text-[11.5px] leading-[16px] text-[var(--text-muted)]">{app.tagline}</span>
      </span>
      {!onOpen && <SoonBadge />}
    </button>
  )
}
