import { useNavigate } from 'react-router'
import { ACTIVE_APPS, COMING_SOON_APPS, type StoreApp } from './storeCatalog'

// SeshatOS's own app catalog, PlayStore/Microsoft Store style - what's
// already active (a real page behind it) versus what's planned but not
// built yet. As each "coming soon" platform lands, it moves from
// COMING_SOON_APPS to ACTIVE_APPS in storeCatalog.tsx - nothing else here
// changes.
export function StorePage() {
  const navigate = useNavigate()

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 pt-4">
      <h1 className="shrink-0 text-[18px] font-semibold text-[var(--text-primary)]">Store</h1>

      <div className="no-scrollbar mt-5 min-h-0 flex-1 space-y-7 overflow-y-auto pb-8">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Active</h2>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
            {ACTIVE_APPS.map((app) => (
              <AppCard key={app.id} app={app} onOpen={app.route ? () => navigate(app.route!) : undefined} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Coming soon</h2>
          <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">More platforms for SeshatOS to host, on the way.</p>
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
            {COMING_SOON_APPS.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function AppCard({ app, onOpen }: { app: StoreApp; onOpen?: () => void }) {
  const active = Boolean(onOpen)
  return (
    <button
      type="button"
      disabled={!active}
      onClick={onOpen}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3 text-left transition-colors enabled:hover:bg-[var(--surface-muted)] disabled:cursor-default"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in srgb, ${app.color} 16%, transparent)`, color: app.color }}
      >
        {app.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{app.name}</span>
        <span className="mt-0.5 line-clamp-2 break-words text-[11.5px] leading-[16px] text-[var(--text-muted)]">{app.description}</span>
      </span>
      {!active && (
        <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
          Soon
        </span>
      )}
    </button>
  )
}
