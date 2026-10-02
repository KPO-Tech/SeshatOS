import { useState, type ReactNode } from 'react'
import type { User } from '@renderer/api/types'
import { AgentsConfig } from './agents/AgentsConfig'
import { AutomationConfig } from './automation/AutomationConfig'
import { ConnectorsConfig } from './connectors/ConnectorsConfig'
import { EnvironmentConfig } from './environment/EnvironmentConfig'
import { KnowledgeConfig } from './knowledge/KnowledgeConfig'
import { MCPConfig } from './mcp/MCPConfig'
import { ModelsConfig } from './models/ModelsConfig'
import { MultimodalConfig } from './multimodal/MultimodalConfig'
import { ProvidersConfig } from './providers/ProvidersConfig'
import { SkillsConfig } from './skills/SkillsConfig'
import { StorageConfig } from './storage/StorageConfig'
import { TitlesConfig } from './titles/TitlesConfig'
import { WebSearchConfig } from './web-search/WebSearchConfig'

export type ConfigSection =
  | 'providers'
  | 'models'
  | 'titles'
  | 'web-search'
  | 'knowledge'
  | 'multimodal'
  | 'mcp'
  | 'connectors'
  | 'environment'
  | 'storage'
  | 'agents'
  | 'skills'
  | 'automation'

type Props = {
  user: User
  initialSection?: ConfigSection
  onClose: () => void
}

const sections: Array<{ id: ConfigSection; label: string; icon: IconName; group: string; description: string }> = [
  { id: 'providers', label: 'Providers', icon: 'provider', group: 'AI Runtime', description: 'Configure OpenAI, Anthropic, Mistral, Ollama, and custom compatible providers.' },
  { id: 'models', label: 'Models', icon: 'model', group: 'AI Runtime', description: 'Choose defaults, model catalogs, aliases, and fallback behavior.' },
  { id: 'titles', label: 'Titles', icon: 'model', group: 'AI Runtime', description: 'Name new sessions with a small local model that runs alongside the answer.' },
  { id: 'web-search', label: 'Web Search', icon: 'search', group: 'AI Runtime', description: 'Search providers, domain policies, and web retrieval settings.' },
  { id: 'knowledge', label: 'Knowledge', icon: 'book', group: 'Knowledge', description: 'Knowledge bases, retrieval models, document reading, and local OCR.' },
  { id: 'multimodal', label: 'Multimodal', icon: 'media', group: 'Knowledge', description: 'Image generation, voice input, Whisper models, and local media capabilities.' },
  { id: 'mcp', label: 'MCP', icon: 'api', group: 'Workspace Runtime', description: 'MCP servers exposed to agents and tools.' },
  { id: 'connectors', label: 'Connectors', icon: 'connectors', group: 'Workspace Runtime', description: 'External accounts and application connectors.' },
  { id: 'environment', label: 'Environment', icon: 'terminal', group: 'Workspace Runtime', description: 'Encrypted API keys, env vars, and backend restart flow.' },
  { id: 'storage', label: 'Storage', icon: 'storage', group: 'Workspace Runtime', description: 'Local filesystem, object storage, and cache locations.' },
  { id: 'agents', label: 'Agents', icon: 'agent', group: 'Automation', description: 'Agent profiles, permissions, delegation defaults, and system instructions.' },
  { id: 'skills', label: 'Skills', icon: 'skills', group: 'Automation', description: 'Skill repositories downloaded to this machine and the groups they provide.' },
  { id: 'automation', label: 'Automation', icon: 'clock', group: 'Automation', description: 'Device registration, scheduled jobs, and background execution.' }
]

export function ConfigModal({ user, initialSection = 'providers', onClose }: Props) {
  const [activeSection, setActiveSection] = useState<ConfigSection>(initialSection)
  const displayName = user.display_name || user.email
  const active = sections.find((section) => section.id === activeSection) ?? sections[0]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-8 py-8 backdrop-blur-sm">
      <div className="relative flex h-full max-h-[720px] w-full max-w-[1240px] overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-root)] shadow-[0_26px_90px_rgba(0,0,0,0.45)]">
        <aside className="no-scrollbar w-[220px] shrink-0 overflow-y-auto border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)] p-2.5">
          <div className="px-2 py-2">
            <div className="text-[15px] font-semibold text-[var(--text-primary)]">Config</div>
            <div className="mt-1 truncate text-[11px] text-[var(--text-muted)]">{displayName}</div>
          </div>

          <nav className="mt-4 space-y-3">
            {groupedSections().map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 px-3 text-[11px] font-medium text-[var(--text-muted)]">{group}</div>
                <div className="grid gap-1">
                  {items.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={[
                        'flex h-8 items-center gap-2.5 rounded-md px-3 text-left text-[12px] font-semibold transition-colors',
                        activeSection === section.id
                          ? 'bg-[var(--surface-panel)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                      ].join(' ')}
                    >
                      <Icon name={section.icon} />
                      <span className="truncate">{section.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="no-scrollbar min-w-0 flex-1 overflow-y-auto px-12 py-9">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close config"
          >
            <CloseIcon />
          </button>

          <div className="mx-auto min-h-full max-w-[920px] pb-8">
            <h1 className="text-[24px] font-semibold tracking-normal text-[var(--text-primary)]">{active.label}</h1>
            <p className="mt-2 max-w-[620px] text-[13px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
              {active.description}
            </p>

            <div className="mt-5 border-t border-[var(--border-soft)] pt-6">
              {activeSection === 'providers' && <ProvidersConfig />}
              {activeSection === 'models' && <ModelsConfig />}
              {activeSection === 'titles' && <TitlesConfig />}
              {activeSection === 'web-search' && <WebSearchConfig />}
              {activeSection === 'knowledge' && <KnowledgeConfig />}
              {activeSection === 'multimodal' && <MultimodalConfig />}
              {activeSection === 'mcp' && <MCPConfig />}
              {activeSection === 'connectors' && <ConnectorsConfig />}
              {activeSection === 'environment' && <EnvironmentConfig />}
              {activeSection === 'storage' && <StorageConfig />}
              {activeSection === 'agents' && <AgentsConfig />}
              {activeSection === 'skills' && <SkillsConfig />}
              {activeSection === 'automation' && <AutomationConfig />}
              {activeSection !== 'providers' && activeSection !== 'models' && activeSection !== 'titles' && activeSection !== 'web-search' && activeSection !== 'knowledge' && activeSection !== 'multimodal' && activeSection !== 'mcp' && activeSection !== 'connectors' && activeSection !== 'environment' && activeSection !== 'storage' && activeSection !== 'agents' && activeSection !== 'skills' && activeSection !== 'automation' && <ConfigOverview active={active} />}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ConfigOverview({ active }: { active: (typeof sections)[number] }) {
  const current = configDetails[active.id]
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Migration source</h2>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">{current.source}</p>
          </div>
          <span className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
            Planned
          </span>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Scope</h2>
        <div className="mt-3 grid gap-2">
          {current.scope.map((item) => (
            <div key={item} className="flex min-h-9 items-center gap-2.5 rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[13px] text-[var(--text-secondary)]">
              <Icon name="check" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Implementation order</h2>
        <p className="mt-2 text-[13px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
          This panel is ready as a stable shell. The detailed controls will be migrated from `seshat-ui` one section at a time, starting with providers because chat depends on model selection.
        </p>
      </section>
    </div>
  )
}

const configDetails: Record<ConfigSection, { source: string; scope: string[] }> = {
  skills: {
    source: 'seshat-ui/apps/skills-creator',
    scope: ['Skill repositories', 'Install and remove', 'Skill groups']
  },
  providers: {
    source: 'seshat-ui/pages/settings/ProvidersView.tsx',
    scope: ['Provider catalog', 'API key or OAuth connection', 'Connection tests', 'Default provider/model readiness']
  },
  titles: {
    source: 'llama-manager.ts, whisper-manager pattern',
    scope: ['Local title model', 'Model catalog', 'Custom GGUF']
  },
  models: {
    source: 'seshat-ui Home and Conversation model selectors',
    scope: ['Default chat model', 'Provider model catalogs', 'Model aliases', 'Fallback behavior']
  },
  'web-search': {
    source: 'seshat-ui/pages/settings/WebSearchView.tsx',
    scope: ['Enable web search', 'Search providers', 'Allowed and blocked domains', 'Provider tests']
  },
  knowledge: {
    source: 'seshat-ui/pages/settings/KnowledgeView.tsx',
    scope: ['Corpora', 'Embedder settings', 'Reranker settings', 'Document reader settings']
  },
  multimodal: {
    source: 'seshat-ui/pages/settings/CapabilitiesViews.tsx',
    scope: ['Image generation', 'Voice input', 'Whisper model downloads', 'Local media capability status']
  },
  mcp: {
    source: 'seshat-ui/pages/settings/McpView.tsx',
    scope: ['MCP server registry', 'Enable/disable servers', 'Tool exposure policy', 'Runtime diagnostics']
  },
  connectors: {
    source: 'seshat-ui/pages/settings/ConnectorsView.tsx',
    scope: ['External connector accounts', 'Corpus target selection', 'Connector actions', 'Disconnect flow']
  },
  environment: {
    source: 'seshat-ui/pages/settings/EnvironmentView.tsx',
    scope: ['Encrypted env vars', 'API key catalog', 'Apply and restart backend', 'Configured status']
  },
  storage: {
    source: 'seshat-ui/pages/settings/StorageView.tsx and MemoriesView StorageCard',
    scope: ['Local storage mode', 'S3/MinIO later', 'Cache locations', 'Storage health']
  },
  agents: {
    source: 'seshat-ui agent/session settings and future agent store',
    scope: ['Agent profiles', 'Default instructions', 'Delegation permissions', 'Tool access defaults']
  },
  automation: {
    source: 'seshat-ui/pages/settings/CloudAutomationView.tsx',
    scope: ['Device registration', 'Scheduled runs', 'Cloud automation connection', 'Run history']
  }
}

function groupedSections() {
  const groups = new Map<string, typeof sections>()
  sections.forEach((section) => {
    const items = groups.get(section.group) || []
    items.push(section)
    groups.set(section.group, items)
  })
  return Array.from(groups.entries())
}

type IconName =
  | 'provider'
  | 'model'
  | 'search'
  | 'book'
  | 'media'
  | 'api'
  | 'connectors'
  | 'terminal'
  | 'storage'
  | 'agent'
  | 'skills'
  | 'clock'
  | 'check'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    provider: <path d="M4 4h8v8H4ZM2.5 8h3M10.5 8h3M8 2.5v3M8 10.5v3" />,
    model: <path d="M8 2.5 13 5.5v5L8 13.5l-5-3v-5ZM3 5.5l5 3 5-3M8 8.5v5" />,
    search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
    book: <path d="M3 3.5h4.5A2.5 2.5 0 0 1 10 6v7a2.5 2.5 0 0 0-2.5-2.5H3ZM13 3.5h-3A2.5 2.5 0 0 0 7.5 6v7A2.5 2.5 0 0 1 10 10.5h3Z" />,
    media: <path d="M2.5 5.5h11v7h-11ZM5 3.5h6M6 8l2 2 2.5-3 2 2.5" />,
    api: <path d="M5 4v8M11 4v8M3.5 6h3M9.5 10h3M5 12h6" />,
    connectors: <path d="M5 4v4M11 8v4M3.5 6h3M9.5 10h3M6.5 6h3" />,
    terminal: <path d="m3 5 3 3-3 3M8 11h5" />,
    storage: <path d="M3 4c0-1.1 2.2-2 5-2s5 .9 5 2-2.2 2-5 2-5-.9-5-2ZM3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" />,
    agent: <path d="M5 6h6a2 2 0 0 1 2 2v3H3V8a2 2 0 0 1 2-2ZM6 6V3h4v3M6 11v2M10 11v2" />,
    skills: <path d="M8 2v3M8 11v3M3 3.5l2 2M11 10.5l2 2M2 8h3M11 8h3M3 12.5l2-2M11 5.5l2-2" />,
    clock: <><circle cx="8" cy="8" r="5.5" /><path d="M8 5v3l2 1.2" /></>,
    check: <path d="m3 8 3 3 7-7" />
  }

  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5 13 13" />
      <path d="M13 5 5 13" />
    </svg>
  )
}
