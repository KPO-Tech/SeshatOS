import type { ReactNode } from 'react'
import logoSrc from '@renderer/assets/logo.svg'
import { Titlebar } from '@renderer/components/layout/Titlebar'

type Props = {
  children: ReactNode
  title: string
  subtitle: string
  mode: 'login' | 'register' | 'welcome'
}

const highlights = ['Local workspace', 'Secure session', 'Agent tools']

export function AuthLayout({ children, title, subtitle, mode }: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface-root)] text-[var(--text-primary)]">
      <Titlebar />

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <section className="hidden w-[42%] min-w-[330px] max-w-[580px] shrink-0 border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] px-10 py-11 min-[760px]:flex min-[760px]:flex-col min-[1400px]:w-[40%]">
          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-[340px] flex-col items-center text-center">
              <div className="flex size-[86px] items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
                <img src={logoSrc} alt="" className="size-[62px] object-contain" />
              </div>

              <div className="mt-6">
                <div className="text-[20px] font-semibold text-[var(--text-primary)]">SeshatOS</div>
                <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                  Desktop agent workspace
                </div>
              </div>

              <div className="my-6 h-px w-8 bg-[var(--border-strong)]" />

              <p className="m-0 max-w-[280px] text-[13px] leading-7 text-[var(--text-secondary)]">
                A quiet local workspace for agents, tools, memory, and knowledge.
              </p>

              <div className="mt-7 grid w-full max-w-[260px] gap-2.5">
                {highlights.map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-left text-[12px] text-[var(--text-muted)]">
                    <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-success)]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center text-[11px] text-[var(--text-muted)]">
            {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create your workspace' : 'Get started'}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8 min-[760px]:px-8">
            <div className="w-full max-w-[420px]">
              <div className="mb-7 text-center">
                <div className="mb-5 flex justify-center min-[760px]:hidden">
                  <div className="flex size-16 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)]">
                    <img src={logoSrc} alt="" className="size-11 object-contain" />
                  </div>
                </div>
                <h1 className="m-0 text-[26px] font-semibold tracking-normal text-[var(--text-primary)]">{title}</h1>
                <p className="m-0 mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{subtitle}</p>
              </div>
              {children}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
