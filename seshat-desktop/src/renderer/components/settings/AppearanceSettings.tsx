import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONTENT_WIDTHS,
  DEFAULT_APPEARANCE,
  SPACINGS,
  TEXT_SIZES,
  ZOOMS,
  applyAppearance,
  getStoredAppearance,
  setStoredAppearance,
  type AppearancePrefs,
  type ContentWidth,
  type Spacing,
  type TextSize
} from '@renderer/lib/appearance'
import { AccentSwatches } from '@renderer/components/onboarding/AccentSwatches'
import { ACCENTS, chooseAccent, getStoredAccent } from '@renderer/lib/accent'
import { duplicateTheme, exportTheme, importTheme } from '@renderer/lib/customThemes'
import { applyCurrentTheme, chooseMode, chooseTheme, getMainThemes, getThemeMode, onThemeChange, shownThemeId, updateCustomThemes, type MainThemes, type ThemeMode } from '@renderer/lib/theme'
import { allThemes, themeById, type ThemeSeed } from '@renderer/lib/themes'
import { ActionButton, SettingRow, SettingsCard, SettingsPage, SettingsTabs, type SettingsTab } from './kit'
import { Segmented, ThemeCard, ThemeGroup, ThemePreview } from './ThemeCards'
import { ThemeEditor } from './ThemeEditor'

type Filter = 'all' | 'dark' | 'light'
type Tab = 'theme' | 'interface'

// The names of the steps of the interface settings, as keys of the settings catalogue (the steps themselves are in lib/appearance.ts).
const TEXT_SIZE_KEYS: Record<TextSize, string> = {
  small: 'settings:appearance.options.textSize.small',
  default: 'settings:appearance.options.textSize.default',
  large: 'settings:appearance.options.textSize.large',
  xlarge: 'settings:appearance.options.textSize.xlarge'
}
const SPACING_KEYS: Record<Spacing, string> = {
  compact: 'settings:appearance.options.spacing.compact',
  comfortable: 'settings:appearance.options.spacing.comfortable',
  spacious: 'settings:appearance.options.spacing.spacious'
}
const WIDTH_KEYS: Record<ContentWidth, string> = {
  narrow: 'settings:appearance.options.width.narrow',
  default: 'settings:appearance.options.width.default',
  wide: 'settings:appearance.options.width.wide'
}

// Seshat's own, in the order they are shown: its two dark ones, then its two light ones.
const SESHAT_ORDER = ['dark', 'seshat-night', 'light', 'shine']

function customThemes(): ThemeSeed[] {
  return allThemes().filter((seed) => seed.category === 'custom')
}

type Appearance = { mode: ThemeMode; main: MainThemes; shown: string }

function readAppearance(): Appearance {
  return { mode: getThemeMode(), main: getMainThemes(), shown: shownThemeId() }
}

export function AppearanceSettings() {
  const { t } = useTranslation('settings')
  const tabs: Array<SettingsTab<Tab>> = [
    { id: 'theme', label: t('appearance.tabs.theme') },
    { id: 'interface', label: t('appearance.tabs.interface') }
  ]
  const [tab, setTab] = useState<Tab>('theme')
  const [filter, setFilter] = useState<Filter>('all')
  const [{ mode, main, shown }, setAppearance] = useState<Appearance>(readAppearance)
  // readAppearance above loaded the themes the person made.
  const [custom, setCustom] = useState<ThemeSeed[]>(customThemes)
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => getStoredAppearance())
  const [accent, setAccent] = useState<string | null>(() => getStoredAccent())
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => onThemeChange(() => setAppearance(readAppearance())), [])

  // The theme on screen: the one the accent, the editor and the export work on.
  const selected = themeById(shown)
  const visible = (seed: ThemeSeed) => filter === 'all' || seed.scheme === filter
  const inCategory = (category: ThemeSeed['category']) => allThemes().filter((seed) => seed.category === category && visible(seed))

  function commit(list: ThemeSeed[], select?: string) {
    const stored = updateCustomThemes(list)
    setCustom(list)
    if (!stored) setNotice({ tone: 'error', text: t('appearance.notices.saveFailed') })
    if (select) chooseTheme(select)
    else {
      applyCurrentTheme()
      setAppearance(readAppearance())
    }
  }

  function duplicate() {
    const source = selected ?? themeById('dark')
    if (!source) return
    const copy = duplicateTheme(source, t('appearance.copyName', { name: source.label }))
    commit([...custom, copy], copy.id)
    setNotice(null)
  }

  function remove(seed: ThemeSeed) {
    if (!window.confirm(t('appearance.confirmDelete', { name: seed.label }))) return
    commit(custom.filter((item) => item.id !== seed.id))
  }

  async function onImport(file: File | undefined) {
    if (!file) return
    try {
      const seed = importTheme(await file.text())
      commit([...custom, seed], seed.id)
      setNotice({ tone: 'ok', text: t('appearance.notices.imported', { name: seed.label }) })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : t('appearance.notices.importFailed') })
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
      setNotice({ tone: 'ok', text: t('appearance.notices.copied') })
    } catch {
      setNotice({ tone: 'error', text: t('appearance.notices.copyFailed') })
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

  const card = (seed: ThemeSeed) => (
    <ThemeCard key={seed.id} seed={seed} selected={shown === seed.id} main={main[seed.scheme] === seed.id} onSelect={() => chooseTheme(seed.id)} />
  )
  const seshat = SESHAT_ORDER.map((id) => themeById(id)).filter((seed): seed is ThemeSeed => !!seed && visible(seed))
  const dark = inCategory('dark')
  const light = inCategory('light')
  const mine = custom.filter(visible)

  return (
    <SettingsPage id="appearance" tabs={<SettingsTabs tabs={tabs} value={tab} onChange={setTab} />}>
      {tab === 'theme' ? (
        <>
          <MainThemesCard mode={mode} main={main} shown={shown} />

          <SettingsCard
            title={t('appearance.accent.card')}
            padded
            action={
              accent ? (
                <ActionButton
                  onClick={() => {
                    chooseAccent(null)
                    setAccent(null)
                  }}
                >
                  {t('appearance.accent.useOwn')}
                </ActionButton>
              ) : undefined
            }
          >
            <AccentSwatches
              current={accent ?? selected?.accent ?? ACCENTS[0].hex}
              onPick={(hex) => {
                chooseAccent(hex)
                setAccent(hex)
              }}
            />
          </SettingsCard>

          <SettingsCard
            title={t('appearance.themes.card')}
            padded
            action={
              <Segmented
                label={t('appearance.themes.show')}
                value={filter}
                options={[
                  { value: 'all', label: t('appearance.themes.filter.all') },
                  { value: 'dark', label: t('appearance.themes.filter.dark') },
                  { value: 'light', label: t('appearance.themes.filter.light') }
                ]}
                onChange={setFilter}
              />
            }
          >
            <div className="grid gap-6">
              {seshat.length > 0 && <ThemeGroup title={t('appearance.themes.groups.seshat')}>{seshat.map(card)}</ThemeGroup>}
              {mine.length > 0 && <ThemeGroup title={t('appearance.themes.groups.mine')}>{mine.map(card)}</ThemeGroup>}
              {dark.length > 0 && <ThemeGroup title={t('appearance.themes.groups.dark')}>{dark.map(card)}</ThemeGroup>}
              {light.length > 0 && <ThemeGroup title={t('appearance.themes.groups.light')}>{light.map(card)}</ThemeGroup>}
            </div>
          </SettingsCard>

          <SettingsCard title={t('appearance.customize.card')} padded action={<ActionButton onClick={duplicate}>{t('appearance.customize.duplicate')}</ActionButton>}>
            {selected?.category === 'custom' ? (
              <ThemeEditor
                theme={selected}
                onChange={(next) => commit(custom.map((item) => (item.id === next.id ? next : item)))}
                onDelete={() => remove(selected)}
              />
            ) : (
              <p className="m-0 text-[12px] text-[var(--text-muted)]">{t('appearance.customize.locked')}</p>
            )}
          </SettingsCard>

          <SettingsCard title={t('appearance.importExport.card')}>
            <SettingRow title={t('appearance.importExport.themeFile')}>
              <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { void onImport(event.target.files?.[0]); event.target.value = '' }} />
              <ActionButton onClick={() => importRef.current?.click()}>{t('appearance.importExport.import')}</ActionButton>
              <ActionButton disabled={!selected} onClick={() => selected && download(selected)}>{t('appearance.importExport.export')}</ActionButton>
              <ActionButton disabled={!selected} onClick={() => selected && void copyJson(selected)}>{t('appearance.importExport.copyJson')}</ActionButton>
            </SettingRow>
            {notice && <p className={`m-0 px-4 py-2.5 text-[12px] ${notice.tone === 'ok' ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}`}>{notice.text}</p>}
          </SettingsCard>
        </>
      ) : (
        <SettingsCard
          title={t('appearance.interface.card')}
          action={
            <ActionButton disabled={isDefault} onClick={() => update(DEFAULT_APPEARANCE)}>
              {t('appearance.interface.reset')}
            </ActionButton>
          }
        >
          <div className="px-4 py-3">
            <div className="mb-2 text-[13px] font-semibold text-[var(--text-primary)]">{t('appearance.interface.size')}</div>
            <input
              type="range"
              min={0}
              max={ZOOMS.length - 1}
              step={1}
              value={zoomIndex}
              aria-label={t('appearance.interface.size')}
              onChange={(event) => update({ zoom: ZOOMS[Number(event.target.value)] })}
              className="w-full accent-[var(--accent-primary)]"
            />
            <div className="mt-1 flex justify-between text-[11px] font-semibold text-[var(--text-muted)]">
              {ZOOMS.map((zoom) => (
                <span key={zoom} className={zoom === prefs.zoom ? 'text-[var(--text-primary)]' : undefined}>{zoom}%</span>
              ))}
            </div>
          </div>
          <Choice title={t('appearance.interface.textSize')} value={prefs.textSize} options={TEXT_SIZES.map((o) => ({ value: o.value, label: t(TEXT_SIZE_KEYS[o.value]) }))} onChange={(textSize) => update({ textSize })} />
          <Choice title={t('appearance.interface.spacing')} value={prefs.spacing} options={SPACINGS.map((o) => ({ value: o.value, label: t(SPACING_KEYS[o.value]) }))} onChange={(spacing) => update({ spacing })} />
          <Choice title={t('appearance.interface.width')} value={prefs.contentWidth} options={CONTENT_WIDTHS.map((o) => ({ value: o.value, label: t(WIDTH_KEYS[o.value]) }))} onChange={(contentWidth) => update({ contentWidth })} />
        </SettingsCard>
      )}
    </SettingsPage>
  )
}

/**
 * The two main themes and the mode. The button of the title bar switches between them; System follows the operating system. A theme
 * picked below becomes the main one of its scheme.
 */
function MainThemesCard({ mode, main, shown }: { mode: ThemeMode; main: MainThemes; shown: string }) {
  const { t } = useTranslation('settings')
  const modes: Array<{ value: ThemeMode; label: string }> = [
    { value: 'dark', label: t('appearance.mainThemes.mode.dark') },
    { value: 'light', label: t('appearance.mainThemes.mode.light') },
    { value: 'system', label: t('appearance.mainThemes.mode.system') }
  ]
  const slot = (scheme: 'dark' | 'light') => {
    const seed = themeById(main[scheme])
    if (!seed) return null
    const active = shown === seed.id
    return (
      <button
        type="button"
        onClick={() => chooseMode(scheme)}
        aria-pressed={active}
        className={[
          'flex min-w-[260px] flex-1 items-center gap-4 rounded-xl border p-3 text-left transition-colors',
          active ? 'border-[var(--text-primary)] bg-[var(--surface-muted)]' : 'border-[var(--border-soft)] hover:bg-[var(--surface-muted)]'
        ].join(' ')}
      >
        <div className="w-[150px] shrink-0">
          <ThemePreview seed={seed} height={84} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{scheme === 'dark' ? t('appearance.mainThemes.darkTheme') : t('appearance.mainThemes.lightTheme')}</div>
          <div className="mt-0.5 truncate text-[18px] font-semibold text-[var(--text-primary)]">{seed.label}</div>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">{active ? t('appearance.mainThemes.onScreen') : t('appearance.mainThemes.clickToShow')}</div>
        </div>
      </button>
    )
  }
  return (
    <SettingsCard title={t('appearance.mainThemes.card')} padded action={<Segmented label={t('appearance.mainThemes.modeLabel')} value={mode} options={modes} onChange={chooseMode} />}>
      <div className="flex flex-wrap gap-3">
        {slot('dark')}
        {slot('light')}
      </div>
      <p className="m-0 mt-3 text-[12px] text-[var(--text-muted)]">
        {t('appearance.mainThemes.help')}
      </p>
    </SettingsCard>
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
