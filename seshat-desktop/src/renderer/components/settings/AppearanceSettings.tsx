import { useRef, useState } from 'react'
import {
  CONTENT_WIDTHS,
  DEFAULT_APPEARANCE,
  SPACINGS,
  TEXT_SIZES,
  ZOOMS,
  applyAppearance,
  getStoredAppearance,
  setStoredAppearance,
  type AppearancePrefs
} from '@renderer/lib/appearance'
import { duplicateTheme, exportTheme, importTheme } from '@renderer/lib/customThemes'
import { applyTheme, getStoredTheme, updateCustomThemes, type ThemePreference } from '@renderer/lib/theme'
import { allThemes, themeById, type ThemeSeed } from '@renderer/lib/themes'
import { ActionButton, SettingRow, SettingsCard, SettingsPage, SettingsTabs, type SettingsTab } from './kit'
import { Segmented, SystemCard, ThemeCard, ThemeGroup, ThemePreview } from './ThemeCards'
import { ThemeEditor } from './ThemeEditor'

type Props = {
  theme: ThemePreference
  onThemeChange: (theme: ThemePreference) => void
}

type Filter = 'all' | 'dark' | 'light'
type Tab = 'theme' | 'interface'
const TABS: Array<SettingsTab<Tab>> = [
  { id: 'theme', label: 'Theme' },
  { id: 'interface', label: 'Interface' }
]

function customThemes(): ThemeSeed[] {
  return allThemes().filter((seed) => seed.category === 'custom')
}

export function AppearanceSettings({ theme, onThemeChange }: Props) {
  const [tab, setTab] = useState<Tab>('theme')
  const [filter, setFilter] = useState<Filter>('all')
  const [custom, setCustom] = useState<ThemeSeed[]>(() => {
    getStoredTheme() // makes sure the themes the person made are loaded
    return customThemes()
  })
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => getStoredAppearance())
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const selected = theme === 'auto' ? undefined : themeById(theme)
  const visible = (seed: ThemeSeed) => filter === 'all' || seed.scheme === filter
  const inCategory = (category: ThemeSeed['category']) => allThemes().filter((seed) => seed.category === category && visible(seed))

  function commit(list: ThemeSeed[], select?: string) {
    const stored = updateCustomThemes(list)
    setCustom(list)
    if (!stored) setNotice({ tone: 'error', text: 'Your themes could not be saved in this browser: they will be lost when the app closes.' })
    if (select) onThemeChange(select)
    else applyTheme(getStoredTheme())
  }

  function duplicate() {
    const source = selected ?? themeById('dark')
    if (!source) return
    const copy = duplicateTheme(source, `${source.label} copy`)
    commit([...custom, copy], copy.id)
    setNotice(null)
  }

  function remove(seed: ThemeSeed) {
    if (!window.confirm(`Delete the theme “${seed.label}”?`)) return
    commit(custom.filter((item) => item.id !== seed.id), selected?.id === seed.id ? 'auto' : undefined)
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    try {
      const seed = importTheme(await file.text())
      commit([...custom, seed], seed.id)
      setNotice({ tone: 'ok', text: `Imported “${seed.label}”.` })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'This theme could not be imported.' })
    }
  }

  function download(seed: ThemeSeed) {
    const url = URL.createObjectURL(new Blob([exportTheme(seed)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${seed.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'theme'}.seshat-theme.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function copyJson(seed: ThemeSeed) {
    try {
      await navigator.clipboard.writeText(exportTheme(seed))
      setNotice({ tone: 'ok', text: 'Theme copied.' })
    } catch {
      setNotice({ tone: 'error', text: 'The theme could not be copied.' })
    }
  }

  const update = (patch: Partial<AppearancePrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    setStoredAppearance(next)
    applyAppearance(next)
  }
  const isDefault = JSON.stringify(prefs) === JSON.stringify(DEFAULT_APPEARANCE)
  const zoomIndex = Math.max(0, ZOOMS.indexOf(prefs.zoom))

  const select = (id: string) => () => onThemeChange(id)
  const card = (seed: ThemeSeed) => <ThemeCard key={seed.id} seed={seed} selected={theme === seed.id} onSelect={select(seed.id)} />
  const dark = inCategory('dark')
  const light = inCategory('light')
  const gradients = inCategory('gradient')
  const mine = custom.filter(visible)

  return (
    <SettingsPage id="appearance" tabs={<SettingsTabs tabs={TABS} value={tab} onChange={setTab} />}>
      {tab === 'theme' ? (
        <>
          <CurrentTheme theme={theme} selected={selected} />

          <SettingsCard
            title="Presets"
            padded
            action={
              <Segmented
                label="Show"
                value={filter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' }
                ]}
                onChange={setFilter}
              />
            }
          >
            <div className="grid gap-6">
              <ThemeGroup title="Seshat">
                <SystemCard selected={theme === 'auto'} onSelect={select('auto')} />
                {allThemes().filter((seed) => seed.category === 'seshat').map(card)}
              </ThemeGroup>
              {mine.length > 0 && <ThemeGroup title="My themes">{mine.map(card)}</ThemeGroup>}
              {dark.length > 0 && <ThemeGroup title="Dark">{dark.map(card)}</ThemeGroup>}
              {light.length > 0 && <ThemeGroup title="Light">{light.map(card)}</ThemeGroup>}
              {gradients.length > 0 && <ThemeGroup title="Gradients">{gradients.map(card)}</ThemeGroup>}
            </div>
          </SettingsCard>

          <SettingsCard title="Customize" padded action={<ActionButton onClick={duplicate}>Duplicate</ActionButton>}>
            {selected?.category === 'custom' ? (
              <ThemeEditor
                theme={selected}
                onChange={(next) => commit(custom.map((item) => (item.id === next.id ? next : item)))}
                onDelete={() => remove(selected)}
              />
            ) : (
              <p className="m-0 text-[12px] text-[var(--text-muted)]">Presets cannot be changed. Duplicate one to make your own.</p>
            )}
          </SettingsCard>

          <SettingsCard title="Import and export">
            <SettingRow title="Theme file">
              <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void onImport(event.target.files?.[0]); event.target.value = '' }} />
              <ActionButton onClick={() => importRef.current?.click()}>Import</ActionButton>
              <ActionButton disabled={!selected} onClick={() => selected && download(selected)}>Export</ActionButton>
              <ActionButton disabled={!selected} onClick={() => selected && void copyJson(selected)}>Copy JSON</ActionButton>
            </SettingRow>
            {notice && <p className={`m-0 px-4 py-2.5 text-[12px] ${notice.tone === 'ok' ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}`}>{notice.text}</p>}
          </SettingsCard>
        </>
      ) : (
        <SettingsCard
          title="Interface"
          action={
            <ActionButton disabled={isDefault} onClick={() => update(DEFAULT_APPEARANCE)}>
              Reset
            </ActionButton>
          }
        >
          <div className="px-4 py-3">
            <div className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">Interface size</div>
            <input
              type="range"
              min={0}
              max={ZOOMS.length - 1}
              step={1}
              value={zoomIndex}
              aria-label="Interface size"
              onChange={(event) => update({ zoom: ZOOMS[Number(event.target.value)] })}
              className="w-full accent-[var(--accent-primary)]"
            />
            <div className="mt-1 flex justify-between text-[11px] font-semibold text-[var(--text-muted)]">
              {ZOOMS.map((zoom) => (
                <span key={zoom} className={zoom === prefs.zoom ? 'text-[var(--text-primary)]' : undefined}>{zoom}%</span>
              ))}
            </div>
          </div>
          <Choice title="Chat text size" value={prefs.textSize} options={TEXT_SIZES.map((o) => ({ value: o.value, label: o.label }))} onChange={(textSize) => update({ textSize })} />
          <Choice title="Spacing" value={prefs.spacing} options={SPACINGS.map((o) => ({ value: o.value, label: o.label }))} onChange={(spacing) => update({ spacing })} />
          <Choice title="Conversation width" value={prefs.contentWidth} options={CONTENT_WIDTHS.map((o) => ({ value: o.value, label: o.label }))} onChange={(contentWidth) => update({ contentWidth })} />
        </SettingsCard>
      )}
    </SettingsPage>
  )
}

function CurrentTheme({ theme, selected }: { theme: ThemePreference; selected: ThemeSeed | undefined }) {
  const seed = selected ?? themeById('dark')
  if (!seed) return null
  const name = theme === 'auto' ? 'System' : seed.label
  const swatch = (color: string, label: string) => (
    <span key={label} title={`${label} ${color}`} className="size-5 rounded border border-[var(--border-strong)]" style={{ background: color }} />
  )
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <div className="w-[280px] max-w-full shrink-0">
        <ThemePreview seed={seed} height={130} />
      </div>
      <div>
        <div className="text-[26px] font-semibold leading-tight text-[var(--text-primary)]">{name}</div>
        <div className="mt-1 text-[12px] text-[var(--text-muted)]">
          {theme === 'auto' ? 'Follows your system' : seed.category === 'custom' ? 'Your theme' : seed.wallpaper ? 'Gradient' : seed.scheme === 'dark' ? 'Dark' : 'Light'}
        </div>
        <div className="mt-3 flex gap-1.5">
          {swatch(seed.bg, 'Surface')}
          {swatch(seed.accent, 'Accent')}
          {swatch(seed.text, 'Text')}
        </div>
      </div>
    </div>
  )
}

function Choice<T extends string>({
  title,
  value,
  options,
  onChange
}: {
  title: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <SettingRow title={title}>
      <Segmented label={title} value={value} options={options} onChange={onChange} />
    </SettingRow>
  )
}
