import type { ReactNode } from 'react'
import { Check, Download, DoubleRight, Info, SettingTwo } from '@icon-park/react'
import { ComponentCard } from './ComponentCard'
import { COMPONENT_CARDS } from './componentCards'
import { bytesToDownload, formatBytes, type Choices, type SetupComponentId } from './setupFormat'

export type SetupMode = 'recommended' | 'custom' | 'skip'

type PlanComponent = {
  id: SetupComponentId
  available: boolean
  unavailableReason?: string
  note?: string
  engineBytes?: number
  options: Array<{ id: string; label: string; sizeBytes: number; description: string; recommended: boolean; installed?: boolean }>
}

const MODES: Array<{ id: SetupMode; title: string; icon: ReactNode }> = [
  { id: 'recommended', title: 'Download recommended', icon: <Download theme="outline" size={22} /> },
  { id: 'custom', title: 'Customize my install', icon: <SettingTwo theme="outline" size={22} /> },
  { id: 'skip', title: 'Skip for now', icon: <DoubleRight theme="outline" size={22} /> }
]

function ModeCard({ mode, selected, onPick }: { mode: (typeof MODES)[number]; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
        selected ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]' : 'border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-panel)_70%,transparent)] hover:border-[var(--border-strong)]'
      }`}
    >
      <span className="shrink-0 text-[var(--accent-primary)]">{mode.icon}</span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[15px] font-semibold text-[var(--text-primary)]" title={mode.title}>
        {mode.title}
      </span>
      <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[var(--accent-primary)]' : 'border-[var(--border-strong)]'}`} aria-hidden="true">
        {selected && <span className="size-2.5 rounded-full bg-[var(--accent-primary)]" />}
      </span>
    </button>
  )
}

/** One line of the overview: what it is, which model, how big, and whether it is part of the install. */
function OverviewRow({ component, choices }: { component: PlanComponent; choices: Choices }) {
  const card = COMPONENT_CARDS[component.id]
  const choice = choices[component.id]
  const on = component.available && Boolean(choice?.install)
  const option = component.options.find((candidate) => candidate.id === choice?.modelId) ?? component.options[0]
  return (
    <li className={`flex items-center gap-4 rounded-xl border border-[var(--border-soft)] px-4 py-3 ${on ? 'bg-[color-mix(in_srgb,var(--surface-panel)_60%,transparent)]' : 'opacity-60'}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]">{card.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[14.5px] font-semibold text-[var(--text-primary)]">
          {card.title}
          {option && component.available && <span className="rounded-full border border-[var(--border-soft)] px-2 py-px text-[11.5px] font-normal text-[var(--text-secondary)]">{option.label}</span>}
        </span>
        <span className="block truncate text-[12.5px] text-[var(--text-muted)]">{component.available ? card.tagline : component.unavailableReason}</span>
      </span>
      {component.available && option && on && (
        <span className={`shrink-0 text-[13px] ${option.installed ? 'text-[var(--accent-success)]' : 'text-[var(--text-secondary)]'}`}>{option.installed ? 'Installed' : formatBytes(bytesToDownload(option) + (component.engineBytes ?? 0))}</span>
      )}
      {!component.available ? (
        <span className="shrink-0 rounded-full border border-[var(--border-soft)] px-2.5 py-0.5 text-[11.5px] text-[var(--text-muted)]">Not in this version</span>
      ) : (
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-md ${on ? 'bg-[var(--accent-primary)] text-white' : 'border border-[var(--border-strong)]'}`}
          aria-label={on ? 'Included' : 'Not included'}
        >
          {on && <Check theme="outline" size={14} strokeWidth={5} />}
        </span>
      )}
    </li>
  )
}

type Props = {
  components: PlanComponent[]
  choices: Choices
  mode: SetupMode
  onMode: (mode: SetupMode) => void
  onChange: (id: SetupComponentId, choice: { install: boolean; modelId: string }) => void
  totalBytes: number
  freeBytes: number | null
  fits: boolean
}

/** The page where the person decides what the computer downloads: a way to go about it, and what that means for each part. */
export function ModelsChoice({ components, choices, mode, onMode, onChange, totalBytes, freeBytes, fits }: Props) {
  const shown = mode === 'skip' ? {} : choices
  const total = mode === 'skip' ? 0 : totalBytes
  return (
    <>
      <div role="radiogroup" aria-label="How to set up" className="grid w-full grid-cols-3 gap-4">
        {MODES.map((item) => (
          <ModeCard key={item.id} mode={item} selected={mode === item.id} onPick={() => onMode(item.id)} />
        ))}
      </div>

      <section className="w-full rounded-3xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-panel)_82%,transparent)] p-5 backdrop-blur-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="m-0 text-[18px] font-semibold">{mode === 'custom' ? 'Choose what to install' : 'Install overview'}</h2>
            <p className="m-0 mt-0.5 text-[13px] text-[var(--text-secondary)]">
              {mode === 'skip' ? 'Nothing will be downloaded now.' : mode === 'custom' ? 'Each one runs on your computer and costs nothing.' : 'Everything below runs on your computer and costs nothing.'}
            </p>
          </div>
          <div className="flex items-center gap-4 text-[13px] text-[var(--text-secondary)]">
            <span>
              Total size: <strong className="font-semibold text-[var(--text-primary)]">{total > 0 ? formatBytes(total) : '0 MB'}</strong>
            </span>
            {freeBytes !== null && (
              <span className={fits ? '' : 'font-semibold text-[var(--accent-danger)]'}>
                Free space: {formatBytes(freeBytes)}
                {!fits && ' · not enough'}
              </span>
            )}
          </div>
        </div>

        {mode === 'custom' ? (
          <div className="mt-4 grid gap-3">
            {components.map((component) => (
              <ComponentCard
                key={component.id}
                title={COMPONENT_CARDS[component.id].title}
                tagline={COMPONENT_CARDS[component.id].tagline}
                icon={COMPONENT_CARDS[component.id].icon}
                available={component.available}
                unavailableReason={component.unavailableReason}
                note={component.note}
                options={component.options}
                choice={choices[component.id]}
                onChange={(choice) => onChange(component.id, choice)}
              />
            ))}
          </div>
        ) : (
          <ul className="m-0 mt-4 grid list-none gap-2.5 p-0">
            {components.map((component) => (
              <OverviewRow key={component.id} component={component} choices={shown} />
            ))}
          </ul>
        )}

        <p className="m-0 mt-4 flex items-center gap-2.5 rounded-xl border border-[var(--border-soft)] px-4 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
          <span className="text-[var(--accent-primary)]">
            <Info theme="outline" size={16} />
          </span>
          You can add, change or remove any of it later in Config.
        </p>
      </section>
    </>
  )
}
