import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SettingRow, SettingsCard, Toggle } from '@renderer/components/settings/kit'
import { ExampleGallery } from '@renderer/components/generative/ExampleGallery'
import { TabBar, type TabItem } from '@renderer/components/ui/TabBar'
import { useUserPreferences } from '@renderer/hooks/useUserPreferences'

// Generative UI: what the agent can draw in its answers (tables, figures, forms, quizzes, sketches of a page), the switch that allows it,
// every example it is taught from, and requests to try it with. The switch is the same preference as Settings > Answers.

type Tab = 'overview' | 'gallery'
type Mode = 'auto' | 'on' | 'off'

export function GenerativeUiPage() {
  const { t } = useTranslation('generative')
  const navigate = useNavigate()
  const { prefs, busy, error, save } = useUserPreferences()
  const [tab, setTab] = useState<Tab>('overview')
  const enabled = prefs?.rich_answers_enabled !== false
  // Requests that bring out each family; the prompt is the text sent, in the language of the person.
  const tryIt = [
    { id: 'quiz', label: t('tryIt.items.quiz.label'), prompt: t('tryIt.items.quiz.prompt') },
    { id: 'cards', label: t('tryIt.items.cards.label'), prompt: t('tryIt.items.cards.prompt') },
    { id: 'essay', label: t('tryIt.items.essay.label'), prompt: t('tryIt.items.essay.prompt') },
    { id: 'sine', label: t('tryIt.items.sine.label'), prompt: t('tryIt.items.sine.prompt') },
    { id: 'parabola', label: t('tryIt.items.parabola.label'), prompt: t('tryIt.items.parabola.prompt') },
    { id: 'site', label: t('tryIt.items.site.label'), prompt: t('tryIt.items.site.prompt') },
    { id: 'dashboard', label: t('tryIt.items.dashboard.label'), prompt: t('tryIt.items.dashboard.prompt') },
    { id: 'architecture', label: t('tryIt.items.architecture.label'), prompt: t('tryIt.items.architecture.prompt') }
  ]
  const modes = prefs?.rich_families ?? {}
  const words = prefs?.rich_family_words ?? {}
  const families = [
    { id: 'charts', label: t('families.charts.label'), hint: t('families.charts.hint') },
    { id: 'forms', label: t('families.forms.label'), hint: t('families.forms.hint') },
    { id: 'design', label: t('families.design.label'), hint: t('families.design.hint') },
    { id: 'architecture', label: t('families.architecture.label'), hint: t('families.architecture.hint') }
  ]
  const modeLabels: Record<Mode, string> = { auto: t('families.modes.auto'), on: t('families.modes.on'), off: t('families.modes.off') }
  function chooseMode(family: string, mode: Mode) {
    if (busy) return
    const next: Record<string, 'on' | 'off'> = { ...modes }
    if (mode === 'auto') delete next[family]
    else next[family] = mode
    void save({ rich_families: next })
  }
  const tabs: Array<TabItem<Tab>> = [
    { id: 'overview', label: t('page.tabs.overview') },
    { id: 'gallery', label: t('page.tabs.gallery') }
  ]

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden pt-4">
      <header className="shrink-0 px-8">
        <h1 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">{t('page.title')}</h1>
        <p className="mb-0 mt-1 text-[12.5px] text-[var(--text-muted)]">{t('page.subtitle')}</p>
      </header>
      <TabBar className="mt-3" tabs={tabs} value={tab} onChange={setTab} ariaLabel={t('page.title')} />

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-5">
        {error && <div className="mb-3 text-[12.5px] text-[var(--text-muted)]">{error}</div>}

        {tab === 'overview' && (
          <div className="flex max-w-3xl flex-col gap-7">
            <SettingsCard>
              <SettingRow title={t('page.switch.title')} hint={enabled ? t('page.switch.on') : t('page.switch.off')}>
                <Toggle
                  label={t('page.switch.title')}
                  enabled={enabled}
                  onChange={(next) => {
                    if (!busy) void save({ rich_answers_enabled: next })
                  }}
                />
              </SettingRow>
            </SettingsCard>

            <div>
              <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{t('families.title')}</h2>
              <p className="mb-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">{t('families.hint')}</p>
              <div className="mt-3 flex flex-col overflow-hidden rounded-xl border border-[var(--border-soft)]">
                {families.map(({ id, label, hint }) => {
                  const current: Mode = modes[id] ?? 'auto'
                  return (
                    <div key={id} className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-solid border-[var(--border-soft)] px-3.5 py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
                        <div className="text-[11.5px] text-[var(--text-muted)]">
                          {hint}
                          {typeof words[id] === 'number' && ` · ${t('families.cost', { words: words[id] })}`}
                        </div>
                      </div>
                      <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-lg bg-[var(--surface-hover)] p-0.5">
                        {(['auto', 'on', 'off'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={current === mode}
                            disabled={!enabled || busy}
                            onClick={() => chooseMode(id, mode)}
                            className={`cursor-pointer rounded-md border-0 px-2.5 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${current === mode ? 'bg-[var(--accent-primary)] text-white' : 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                          >
                            {modeLabels[mode]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div>
              <h2 className="m-0 text-[13px] font-semibold text-[var(--text-primary)]">{t('tryIt.title')}</h2>
              <p className="mb-0 mt-0.5 text-[11.5px] text-[var(--text-muted)]">{t('tryIt.hint')}</p>
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
                {tryIt.map(({ id, label, prompt }) => (
                  <button
                    key={id}
                    type="button"
                    disabled={!enabled}
                    title={enabled ? undefined : t('tryIt.disabled')}
                    onClick={() => navigate('/', { state: { prompt } })}
                    className="flex cursor-pointer flex-col gap-1 rounded-xl border border-[var(--border-soft)] bg-transparent p-3 text-left hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="line-clamp-3 text-[12px] leading-snug text-[var(--text-muted)]">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'gallery' && (
          <div className="max-w-3xl">
            <p className="mb-4 mt-0 text-[12.5px] text-[var(--text-muted)]">{t('gallery.intro')}</p>
            <ExampleGallery />
          </div>
        )}
      </div>
    </section>
  )
}
