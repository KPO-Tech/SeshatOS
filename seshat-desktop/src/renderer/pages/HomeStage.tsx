import type { ReactNode } from 'react'
import { ApplicationOne, ChartHistogram, Code, FileText, Globe, Layers, Lightning, Message, Shield } from '@icon-park/react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { useTranslation } from 'react-i18next'

type Start = { id: string; title: string; text: string; prompt: string; color: string; icon: ReactNode }

// What the person can start with: each fills the input with the beginning of a request, to finish in their own words.
const STARTS: Start[] = [
  { id: 'chat', title: 'shell:pages.homeStage.chatTitle', text: 'shell:pages.homeStage.chatText', prompt: '', color: 'var(--accent-primary)', icon: <Message theme="outline" size={26} /> },
  { id: 'files', title: 'shell:pages.homeStage.filesTitle', text: 'shell:pages.homeStage.filesText', prompt: 'Summarize the file at ', color: '#8b5cf6', icon: <FileText theme="outline" size={26} /> },
  { id: 'data', title: 'shell:pages.homeStage.dataTitle', text: 'shell:pages.homeStage.dataText', prompt: 'Analyze the data in ', color: '#22a55b', icon: <ChartHistogram theme="outline" size={26} /> },
  { id: 'web', title: 'shell:pages.homeStage.webTitle', text: 'shell:pages.homeStage.webText', prompt: 'Search the web for ', color: '#3b82f6', icon: <Globe theme="outline" size={26} /> },
  { id: 'code', title: 'shell:pages.homeStage.codeTitle', text: 'shell:pages.homeStage.codeText', prompt: 'Write code that ', color: '#ec4899', icon: <Code theme="outline" size={26} /> }
]

const POWERS = [
  { title: 'shell:pages.homeStage.privateTitle', text: 'shell:pages.homeStage.privateText', icon: <Shield theme="outline" size={18} /> },
  { title: 'shell:pages.homeStage.modularTitle', text: 'shell:pages.homeStage.modularText', icon: <Lightning theme="outline" size={18} /> },
  { title: 'shell:pages.homeStage.openTitle', text: 'shell:pages.homeStage.openText', icon: <Layers theme="outline" size={18} /> }
]

/**
 * The room above the input of the start page: who the workspace is for, a few ways to begin, and what sets it apart. A way to begin
 * only fills the input; nothing starts until the person sends it.
 */
export function HomeStage({ onPick }: { onPick: (prompt: string) => void }) {
  const { t } = useTranslation('shell')
  return (
    <div className="flex w-full flex-col gap-7">
      <header className="relative flex items-center justify-between gap-8">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--accent-primary)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] px-3 py-1 text-[12px] font-semibold text-[var(--accent-primary)]">
            <ApplicationOne theme="outline" size={13} />
            {t('pages.homeStage.yourAiWorkspace')}
          </span>
          <h1 className="home-greeting m-0 mt-4 text-left">
            {t('pages.homeStage.whatAreWe')} <span className="text-[var(--accent-primary)]">{t('pages.homeStage.workingOn')}</span>{t('pages.homeStage.questionMark')}
          </h1>
          <p className="m-0 mt-2.5 max-w-[520px] text-[15px] leading-[1.55] text-[var(--text-secondary)]">{t('pages.homeStage.researchCreateAnalyzeAndAutomate')}</p>
        </div>
        <div className="relative hidden shrink-0 items-center justify-center min-[900px]:flex" aria-hidden="true">
          <SeshatLogo size={104} />
        </div>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3.5">
        {STARTS.map((start) => (
          <button
            key={start.id}
            type="button"
            onClick={() => onPick(start.prompt)}
            className="group flex cursor-pointer flex-col items-start gap-3 rounded-2xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-panel)_80%,transparent)] p-4 text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-[var(--start-color)] hover:shadow-[0_10px_26px_-14px_var(--start-color)]"
            style={{ '--start-color': start.color } as React.CSSProperties}
          >
            <span style={{ color: start.color }}>{start.icon}</span>
            <span>
              <span className="block text-[15.5px] font-semibold text-[var(--text-primary)]">{t(start.title)}</span>
              <span className="mt-1 block text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">{t(start.text)}</span>
            </span>
          </button>
        ))}
      </div>

      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-[var(--border-soft)] bg-[color-mix(in_srgb,var(--surface-panel)_60%,transparent)] px-5 py-4" aria-label={t('pages.homeStage.whatSetsSeshatosApart')}>
        <div className="flex min-w-[220px] flex-1 items-center gap-3.5">
          <SeshatLogo size={38} />
          <div>
            <div className="text-[15px] font-semibold text-[var(--text-primary)]">
              {t('pages.homeStage.thePowerOfSeshat')}<span className="text-[var(--accent-primary)]">{t('pages.homeStage.os')}</span>
            </div>
            <div className="text-[12.5px] leading-[1.5] text-[var(--text-secondary)]">{t('pages.homeStage.aUnifiedEnvironmentForKnowledge')}</div>
          </div>
        </div>
        <ul className="m-0 grid min-w-0 flex-[2] list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 p-0">
          {POWERS.map((power) => (
            <li key={power.title} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]">{power.icon}</span>
              <span>
                <span className="block text-[13px] font-semibold text-[var(--text-primary)]">{t(power.title)}</span>
                <span className="block text-[12px] leading-[1.45] text-[var(--text-muted)]">{t(power.text)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
