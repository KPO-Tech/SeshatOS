import type { ReactNode } from 'react'
import { Check, Info, Plus } from '@icon-park/react'
import type { ProviderSetting } from './providerTypes'

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <h3 className="m-0 mb-2.5 flex items-center gap-2 text-[14px] font-semibold text-[var(--text-primary)]">
        <span className="flex text-[var(--accent-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Step({ done, children }: { done: boolean; children: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${done ? 'bg-[var(--accent-success)] text-white' : 'border border-[var(--border-strong)]'}`}>{done && <Check theme="outline" size={10} strokeWidth={5} />}</span>
      {children}
    </li>
  )
}

/** What helps while connecting providers: what they are for, whether the setup is sound (from the real state), and a way to add one. */
export function ProvidersAside({ settings, onAdd }: { settings: ProviderSetting[]; onAdd: () => void }) {
  const connected = settings.filter((setting) => setting.has_api_key || setting.provider === 'ollama' || setting.auth_kind === 'oauth')
  return (
    <aside className="flex w-full flex-col gap-3 @4xl:w-[280px] @4xl:shrink-0">
      <Card icon={<Info theme="outline" size={16} />} title="About providers">
        <p className="m-0 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
          A provider gives your agents access to models. Connect one or several, choose a default, and every chat and every agent can use it. Keys are saved encrypted on this device.
        </p>
      </Card>

      <Card icon={<Check theme="outline" size={16} />} title="Recommended setup">
        <ul className="m-0 grid list-none gap-2 p-0">
          <Step done={connected.length > 0}>At least one provider connected</Step>
          <Step done={settings.some((setting) => setting.is_default)}>A default provider chosen</Step>
          <Step done={connected.length > 1}>A second provider, to switch when one is down</Step>
        </ul>
      </Card>

      <Card icon={<Plus theme="outline" size={16} />} title="Add a provider">
        <p className="m-0 mb-3 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">Connect another provider, or any endpoint that speaks the OpenAI format.</p>
        <button type="button" onClick={onAdd} className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--border-soft)] bg-transparent text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
          <Plus theme="outline" size={15} />
          Add a provider
        </button>
      </Card>
    </aside>
  )
}
