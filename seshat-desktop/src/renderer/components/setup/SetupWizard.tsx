import { useState, type ReactNode } from 'react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { ComponentCard } from './ComponentCard'
import { InstallProgress } from './InstallProgress'
import { fitsOnDisk, formatBytes, overallProgress, totalDownloadBytes } from './setupFormat'
import type { useSetup } from './useSetup'

type Step = 'welcome' | 'choose' | 'installing' | 'done'
type Setup = ReturnType<typeof useSetup>

const ENTER = { animation: 'fade-in 320ms ease both' } as const

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-11 min-w-[150px] cursor-pointer rounded-full border-0 bg-[var(--accent-primary)] px-7 text-[14.5px] font-semibold text-white shadow-[0_8px_24px_-8px_var(--accent-primary)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-default disabled:opacity-45 disabled:shadow-none"
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
      className="h-11 cursor-pointer rounded-full border border-[var(--border-soft)] bg-transparent px-6 text-[14px] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-default disabled:opacity-45"
    >
      {children}
    </button>
  )
}

function Steps({ current }: { current: Step }) {
  const order: Step[] = ['welcome', 'choose', 'installing', 'done']
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      {order.map((step) => (
        <span
          key={step}
          className={['h-1.5 rounded-full transition-all duration-300', step === current ? 'w-8 bg-[var(--accent-primary)]' : 'w-1.5 bg-[var(--border-strong)]'].join(' ')}
        />
      ))}
    </div>
  )
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="text-center">
      <h1 className="m-0 text-[34px] leading-[1.15] font-normal text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        {title}
      </h1>
      {children && <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.6] text-[var(--text-muted)]">{children}</p>}
    </header>
  )
}

const TITLE_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5.5h12M4 10h8M4 14.5h5" />
    <path d="m13.5 13.5 3 3M16.5 13.5l-3 3" />
  </svg>
)

const VOICE_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
  </svg>
)

const SCAN_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 2.5h6l3.5 3.5v11a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z" />
    <path d="M11.5 2.5V6H15M7 10h6M7 13h4" />
  </svg>
)

const COMPONENT_CARDS = {
  title: {
    title: 'Smart titles',
    tagline: 'Names your conversations for you, with a small model that runs beside the answer.',
    icon: TITLE_ICON
  },
  speech: {
    title: 'Voice dictation',
    tagline: 'Turns your voice into text on this computer, in about a hundred languages.',
    icon: VOICE_ICON
  },
  ocr: {
    title: 'Scanned documents',
    tagline: 'Reads scanned PDFs and photos of documents on this computer, so you can search them and ask questions about them.',
    icon: SCAN_ICON
  }
} as const

export function SetupWizard({ setup }: { setup: Setup }) {
  const { plan, choices, setChoices, progress, running } = setup
  const [step, setStep] = useState<Step>('welcome')
  if (!plan) return null

  const total = totalDownloadBytes(plan, choices)
  const overall = overallProgress(plan, choices, progress)
  const chosenCount = plan.components.filter((component) => component.available && choices[component.id]?.install).length
  const fits = fitsOnDisk(total, plan.freeDiskBytes)
  const anyAvailable = plan.components.some((component) => component.available)
  const hadError = Object.values(progress).some((item) => item?.status === 'error')

  async function install() {
    setStep('installing')
    await setup.run(choices)
    setStep('done')
  }

  async function skip() {
    await setup.run({})
    await setup.finish()
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--surface-root)] px-6 py-10 text-[var(--text-primary)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% -5%, color-mix(in srgb, var(--accent-primary) 20%, transparent), transparent 70%), radial-gradient(40% 35% at 100% 100%, color-mix(in srgb, var(--accent-primary) 9%, transparent), transparent 70%)'
        }}
      />

      <div className="relative z-10 flex w-full max-w-[680px] flex-col items-center gap-8" key={step} style={ENTER}>
        {step === 'welcome' && (
          <>
            <SeshatLogo size={104} />
            <Heading title="Welcome to SeshatOS">Your AI workspace, running on your computer. Two quick choices and you are in.</Heading>
            <ul className="m-0 grid w-full max-w-[460px] list-none gap-3.5 p-0 text-[14.5px] leading-[1.5] text-[var(--text-secondary)]">
              {[
                ['Private by design', 'Your files and conversations stay on this computer.'],
                ['Your choice of model', 'Use any cloud provider, or run models locally.'],
                ['An agent that does the work', 'It reads, writes, searches and runs, with your permission.']
              ].map(([title, text]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-[7px] size-2 shrink-0 rounded-full bg-[var(--accent-primary)]" />
                  <span>
                    <strong className="font-semibold text-[var(--text-primary)]">{title}.</strong> {text}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-center gap-3">
              <PrimaryButton onClick={() => setStep(anyAvailable ? 'choose' : 'done')}>Get started</PrimaryButton>
              <button
                type="button"
                onClick={() => void skip()}
                disabled={running}
                className="cursor-pointer border-0 bg-transparent text-[13px] text-[var(--text-muted)] underline-offset-4 hover:text-[var(--text-secondary)] hover:underline"
              >
                Skip the setup
              </button>
            </div>
          </>
        )}

        {step === 'choose' && (
          <>
            <Heading title="Make it yours">Choose what to download now. Each one runs on your computer, costs nothing, and can be changed later in Config.</Heading>
            <div className="grid w-full gap-4">
              {plan.components.map((component) => (
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
                  onChange={(choice) => setChoices((current) => ({ ...current, [component.id]: choice }))}
                />
              ))}
            </div>
            <div className="flex w-full flex-col items-center gap-4">
              <p className={['m-0 text-[13px]', fits ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--accent-danger)]'].join(' ')}>
                {total > 0 ? `Download: ${formatBytes(total)}` : 'Nothing to download'}
                {plan.freeDiskBytes !== null && ` · Free space: ${formatBytes(plan.freeDiskBytes)}`}
                {!fits && ' · Not enough space for this choice'}
              </p>
              <div className="flex gap-3">
                <QuietButton onClick={() => setStep('welcome')}>Back</QuietButton>
                <PrimaryButton disabled={!fits} onClick={() => void install()}>
                  {total > 0 ? `Install · ${formatBytes(total)}` : 'Continue'}
                </PrimaryButton>
              </div>
            </div>
          </>
        )}

        {step === 'installing' && (
          <>
            <Heading title="Setting things up">
              {chosenCount > 1 ? 'Everything downloads at the same time, so it takes as long as the biggest one.' : 'This takes a few minutes, depending on your connection.'} You can
              leave this window open.
            </Heading>
            <div className="w-full">
              <InstallProgress progress={progress} overall={overall} />
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <SeshatLogo size={88} />
            <Heading title={hadError ? 'Almost there' : "You're all set"}>
              {hadError
                ? 'Something could not be downloaded. SeshatOS works without it, and you can try again in Config.'
                : 'Everything you chose is ready. You can change any of it later in Config.'}
            </Heading>
            {Object.keys(progress).length > 0 && (
              <div className="w-full">
                <InstallProgress progress={progress} />
              </div>
            )}
            <PrimaryButton onClick={() => void setup.finish()}>Open SeshatOS</PrimaryButton>
          </>
        )}

        <Steps current={step} />
      </div>
    </main>
  )
}
