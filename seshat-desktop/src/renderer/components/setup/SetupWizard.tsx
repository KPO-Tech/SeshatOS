import { useState } from 'react'
import { InstallProgress } from './InstallProgress'
import { ModelsChoice, type SetupMode } from './ModelsChoice'
import { ProviderStep } from './ProviderStep'
import { SetupRecap } from './SetupRecap'
import { SetupShell } from './SetupShell'
import { defaultChoices, fitsOnDisk, formatBytes, overallProgress, totalDownloadBytes, type SetupComponentId } from './setupFormat'
import { useProviderStep } from './useProviderStep'
import type { useSetup } from './useSetup'

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
          title="Connect a model"
          subtitle="SeshatOS answers through a model. Use a cloud provider with your own key, or a local one such as Ollama. You can add more later in Config."
        >
          <div className="w-full max-w-[680px]">
            <ProviderStep provider={provider} />
          </div>
          <div className="flex gap-3">
            <QuietButton onClick={() => void skip()} disabled={running}>
              Skip the setup
            </QuietButton>
            {provider.status === 'connected' ? (
              <PrimaryButton onClick={() => setStep(anyAvailable ? 'choose' : 'done')}>Continue</PrimaryButton>
            ) : (
              <QuietButton onClick={() => setStep(anyAvailable ? 'choose' : 'done')}>Skip for now</QuietButton>
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
              <QuietButton onClick={() => setStep('provider')}>Back</QuietButton>
              <PrimaryButton disabled={mode !== 'skip' && !fits} onClick={() => void (mode === 'skip' ? skip() : install())}>
                {mode === 'skip' ? 'Continue' : total > 0 ? `Download and continue (${formatBytes(total)})` : 'Continue'}
              </PrimaryButton>
            </div>
          }
          title="Set up your local models"
          subtitle="Download what SeshatOS needs to read documents, name conversations and listen to you. It all runs on your computer."
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
          title="Setting things up"
          subtitle={`${chosenCount > 1 ? 'Everything downloads at the same time, so it takes as long as the biggest one.' : 'This takes a few minutes, depending on your connection.'} You can leave this window open.`}
        >
          <div className="w-full">
            <InstallProgress progress={progress} overall={overall} />
          </div>
        </SetupShell>
      )}

      {step === 'done' && (
        <SetupShell
          pageKey="done"
          title={hadError ? 'Almost there' : "You're all set"}
          subtitle={
            hadError
              ? 'Something could not be downloaded. You can try again now, or later in Config. SeshatOS works without it.'
              : 'Everything you chose is ready. You can change any of it later in Config.'
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
                {running ? 'Trying again' : 'Try again'}
              </QuietButton>
            )}
            <PrimaryButton disabled={running} onClick={() => void setup.finish()}>
              Open SeshatOS
            </PrimaryButton>
          </div>
        </SetupShell>
      )}
    </>
  )
}
