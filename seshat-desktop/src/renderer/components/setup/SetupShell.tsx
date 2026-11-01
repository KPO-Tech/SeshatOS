import type { ReactNode } from 'react'
import { SeshatLogo } from '@renderer/components/brand/SeshatLogo'
import { Titlebar } from '@renderer/components/layout/Titlebar'
import { IntroBackdrop } from '@renderer/components/onboarding/IntroBackdrop'
import { IntroSteps } from '@renderer/components/onboarding/IntroSteps'

const ENTER = { animation: 'fade-in 320ms ease both' } as const

/**
 * The frame of every page of the setup: the same ribbons, wordmark and step bar as the first two pages, with the setup as the third step,
 * so the person does not feel the look change when it starts.
 */
export function SetupShell({
  title,
  subtitle,
  wide,
  pageKey,
  footer,
  children
}: {
  title: string
  subtitle?: string
  wide?: boolean
  pageKey: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[var(--surface-root)] text-[var(--text-primary)]">
      <IntroBackdrop />
      <Titlebar bare center={null} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col" key={pageKey} style={ENTER}>
        <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-5 pt-1">
          <div className="flex items-center gap-2.5">
            <SeshatLogo size={40} />
            <div className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">
              Seshat<span className="text-[var(--accent-primary)]">OS</span>
            </div>
          </div>
          <h1 className="m-0 mt-4 text-center text-[28px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="m-0 mt-2 max-w-[640px] text-center text-[14.5px] leading-[1.55] text-[var(--text-secondary)]">{subtitle}</p>}

          <div className="mt-4">
            <IntroSteps current={2} />
          </div>

          <div className={`mt-5 flex w-full flex-col items-center gap-5 ${wide ? 'max-w-[960px]' : 'max-w-[680px]'}`}>{children}</div>
        </main>
        {footer && (
          <footer className={`mx-auto flex w-full shrink-0 items-center px-6 pb-6 pt-2 ${wide ? 'max-w-[1008px]' : 'max-w-[728px]'}`}>{footer}</footer>
        )}
      </div>
    </div>
  )
}
