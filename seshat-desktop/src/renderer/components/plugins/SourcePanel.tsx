import type { PluginDefinition, PluginSource } from './catalog/pluginCatalog'
import { ApiKeySourcePanel } from './panels/ApiKeySourcePanel'
import { KnowledgeSourcePanel } from './panels/KnowledgeSourcePanel'
import { OAuthSourcePanel } from './panels/OAuthSourcePanel'
import { WhatsAppSourcePanel } from './panels/WhatsAppSourcePanel'
import type { PluginAccount } from './pluginsTypes'
import { sourceCopy } from './sourceLabels'

type Props = {
  plugin: PluginDefinition
  source: PluginSource
  accounts: PluginAccount[]
  onChanged: () => void
  onClose: () => void
}

// One way of connecting a plugin: heading, explanation and the matching panel.
export function SourcePanel({ plugin, source, accounts, onChanged, onClose }: Props) {
  const { heading, hint } = sourceCopy(source)
  return (
    <section className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] p-3.5">
      <h3 className="text-[12.5px] font-semibold text-[var(--text-primary)]">{heading}</h3>
      <p className="mb-2.5 mt-0.5 text-[11.5px] leading-[17px] text-[var(--text-muted)]">{hint}</p>
      {source.type === 'cloud-oauth' || source.type === 'inbox-oauth' ? (
        <OAuthSourcePanel source={source} title={plugin.title} accounts={accounts} onChanged={onChanged} />
      ) : source.type === 'cloud-key' ? (
        <ApiKeySourcePanel kind={source.kind} title={plugin.title} accounts={accounts} onChanged={onChanged} />
      ) : source.type === 'whatsapp' ? (
        <WhatsAppSourcePanel accounts={accounts} onChanged={onChanged} />
      ) : (
        <KnowledgeSourcePanel accounts={accounts} onClose={onClose} />
      )}
    </section>
  )
}
