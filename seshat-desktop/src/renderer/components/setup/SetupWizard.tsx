import { useState } from 'react'
import { InstallProgress } from './InstallProgress'
import { ModelsChoice, type SetupMode } from './ModelsChoice'
import { ProviderStep } from './ProviderStep'
import { SetupRecap } from './SetupRecap'
import { SetupShell } from './SetupShell'
import { defaultChoices, fitsOnDisk, formatBytes, overallProgress, totalDownloadBytes, type SetupComponentId } from './setupFormat'
import { useProviderStep } from './useProviderStep'
import type { useSetup } from './useSetup'
import { useTranslation } from 'react-i18next'

type Step = 'provider' | 'choose' | 'installing' | 'done'
type Setup = ReturnType<typeof useSetup>

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-12 min-w-[150px] cursor-pointer rounded-2xl border-0 bg-[var(--accent-primary)] px-7 text-[14.5px] font-semibold text-white shadow-[0_8px_24px_-8px_var(--accent-primary)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-default disabled:opacity-45 disabled:shadow-none"
    >
      {children}
    </button>
  )
}

function QuietButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-12 cursor-pointer rounded-2xl border border-[var(--border-soft)] bg-transparent px-6 text-[14px] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-45"
    >
      {children}
    </button>
  )
}

export function SetupWizard({ setup }: { setup: Setup }) {
  const { t } = useTranslation('shell')
  const { plan, choices, setChoices, progress, running } = setup
  const [step, setStep] = useState<Step>('provider')
  const [mode, setMode] = useState<SetupMode>('recommended')
  const provider = useProviderStep()
  if (!plan) return null

  const total = totalDownloadBytes(plan, choices)
  const overall = overallProgress(plan, choices, progress)
  const chosenCount = plan.components.filter((component) => component.available && choices[component.id]?.install).length
  const fits = fitsOnDisk(total, plan.freeDiskBytes)
  const anyAvailable = plan.components.some((component) => component.available)
  const hadError = Object.values(progress).some((item) => item?.status === 'error')

  function pickMode(next: SetupMode) {
    setMode(next)
    if (next === 'recommended' && plan) setChoices(defaultChoices(plan))
  }

  async function install() {
    setStep('installing')
    await setup.run(choices)
    setStep('done')
  }

  async function skip() {
    await setup.run({ title: { install: false, modelId: '' } })
    await setup.finish()
  }

  async function retry() {
    const failed = (Object.keys(progress) as SetupComponentId[]).filter((id) => progress[id]?.status === 'error' && choices[id])
    await setup.run(Object.fromEntries(failed.map((id) => [id, choices[id]])), {
      keepProgress: true
    })
  }

  return (
    <>
      {step === 'provider' && (
        <SetupShell
          pageKey="provider"
          title={t('setup.setupWizard.connectAModel')}
          subtitle={t('setup.setupWizard.seshatosAnswersThroughAModel')}
        >
          <div className="w-full max-w-[680px]">
            <ProviderStep provider={provider} />
          </div>
          <div className="flex gap-3">
            <QuietButton onClick={() => void skip()} disabled={running}>
              {t('setup.setupWizard.skipTheSetup')}
            </QuietButton>
            {provider.status === 'connected' ? (
              <PrimaryButton onClick={() => setStep(anyAvailable ? 'choose' : 'done')}>{t('setup.setupWizard.continue')}</PrimaryButton>
            ) : (
              <QuietButton onClick={() => setStep(anyAvailable ? 'choose' : 'done')}>{t('setup.setupWizard.skipForNow')}</QuietButton>
            )}
          </div>
        </SetupShell>
      )}

      {step === 'choose' && (
        <SetupShell
          pageKey="choose"
          wide
          footer={
            <div className="flex w-full items-center justify-between">
              <QuietButton onClick={() => setStep('provider')}>{t('setup.setupWizard.back')}</QuietButton>
              <PrimaryButton disabled={mode !== 'skip' && !fits} onClick={() => void (mode === 'skip' ? skip() : install())}>
                {mode === 'skip' ? t('setup.setupWizard.continue') : total > 0 ? t('setup.setupWizard.downloadAndContinue', { size: formatBytes(total) }) : t('setup.setupWizard.continue')}
              </PrimaryButton>
            </div>
          }
          title={t('setup.setupWizard.setUpYourLocalModels')}
          subtitle={t('setup.setupWizard.downloadWhatSeshatosNeedsTo')}
        >
          <ModelsChoice
            components={plan.components}
            choices={choices}
            mode={mode}
            onMode={pickMode}
            onChange={(id, choice) => setChoices((current) => ({ ...current, [id]: choice }))}
            totalBytes={total}
            freeBytes={plan.freeDiskBytes}
            fits={fits}
          />
        </SetupShell>
      )}

      {step === 'installing' && (
        <SetupShell
          pageKey="installing"
          title={t('setup.setupWizard.settingThingsUp')}
          subtitle={`${chosenCount > 1 ? t('setup.setupWizard.allAtOnce') : t('setup.setupWizard.fewMinutes')} ${t('setup.setupWizard.leaveOpen')}`}
        >
          <div className="w-full">
            <InstallProgress progress={progress} overall={overall} />
          </div>
        </SetupShell>
      )}

      {step === 'done' && (
        <SetupShell
          pageKey="done"
          title={hadError ? t('setup.setupWizard.almostThere') : t('setup.setupWizard.youReAllSet')}
          subtitle={
            hadError
              ? t('setup.setupWizard.somethingCouldNotBeDownloaded')
              : t('setup.setupWizard.everythingYouChoseIsReady')
          }
        >
          {Object.keys(progress).length > 0 && (
            <div className="w-full">
              <InstallProgress progress={progress} />
            </div>
          )}
          <SetupRecap modelConnected={provider.status === 'connected'} />
          <div className="flex gap-3">
            {hadError && (
              <QuietButton disabled={running} onClick={() => void retry()}>
                {running ? t('setup.setupWizard.tryingAgain') : t('setup.setupWizard.tryAgain')}
              </QuietButton>
            )}
            <PrimaryButton disabled={running} onClick={() => void setup.finish()}>
              {t('setup.setupWizard.openSeshatos')}
            </PrimaryButton>
          </div>
        </SetupShell>
      )}
    </>
  )
}
