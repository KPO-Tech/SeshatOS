import type { ComponentType } from 'react'
import { Brain, Chip, CloudStorage, Contrast, Cube, DataServer, FileText, Info, Keyboard, Magic, MindMapping, Music, Pic, Plug, Robot, Search, SettingTwo, Shield, Terminal, User } from '@icon-park/react'
import type { Edition } from '@renderer/lib/edition'

/** Every page of Settings: what used to be in Settings and in Config now live under one roof. */
export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'shortcuts'
  | 'account'
  | 'providers'
  | 'models'
  | 'titles'
  | 'web-search'
  | 'documents'
  | 'search'
  | 'image'
  | 'audio'
  | 'mcp'
  | 'environment'
  | 'storage'
  | 'skills'
  | 'answers'
  | 'memories'
  | 'data-controls'
  | 'about'
  | 'cloud'

type IconComponent = ComponentType<{ theme?: 'outline' | 'filled'; size?: number | string; fill?: string }>

export type SettingsSectionDef = {
  id: SettingsSectionId
  label: string
  group: string
  icon: IconComponent
  description: string
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'general', label: 'General', group: 'General', icon: SettingTwo, description: 'Language and notifications.' },
  { id: 'appearance', label: 'Appearance', group: 'General', icon: Contrast, description: 'The theme, its colours and the look of the app.' },
  { id: 'shortcuts', label: 'Shortcuts', group: 'General', icon: Keyboard, description: 'The keys to move around the app quickly.' },
  { id: 'account', label: 'Account', group: 'General', icon: User, description: 'Who you are on this device.' },

  { id: 'providers', label: 'Providers', group: 'AI runtime', icon: Cube, description: 'Manage your AI providers, API keys and model settings. Connect several providers to give your agents access to the best models.' },
  { id: 'models', label: 'Models', group: 'AI runtime', icon: Chip, description: 'Choose defaults, model catalogs, aliases, and fallback behavior.' },
  { id: 'titles', label: 'Titles', group: 'AI runtime', icon: Magic, description: 'Name new sessions with a small local model that runs alongside the answer.' },
  { id: 'web-search', label: 'Web search', group: 'AI runtime', icon: Search, description: 'Search providers, domain policies, and web retrieval settings.' },

  { id: 'documents', label: 'Documents', group: 'Capabilities', icon: FileText, description: 'Read and understand documents (PDFs, Office files, images, scans) and make them available to your agents.' },
  { id: 'search', label: 'Search', group: 'Capabilities', icon: MindMapping, description: 'The embedding and reranking models that Knowledge searches your documents with.' },
  { id: 'image', label: 'Images', group: 'Capabilities', icon: Pic, description: 'The provider, model, size and quality the agent uses to create images.' },
  { id: 'audio', label: 'Audio', group: 'Capabilities', icon: Music, description: 'Dictation and transcription (on this computer first), and the voice of speech synthesis.' },

  { id: 'mcp', label: 'MCP servers', group: 'Workspace', icon: Plug, description: 'MCP servers exposed to agents and tools.' },
  { id: 'environment', label: 'Environment', group: 'Workspace', icon: Terminal, description: 'Encrypted API keys, env vars, and backend restart flow.' },
  { id: 'storage', label: 'Storage', group: 'Workspace', icon: DataServer, description: 'Local filesystem, object storage, and cache locations.' },
  { id: 'skills', label: 'Skill repositories', group: 'Workspace', icon: Robot, description: 'Skill repositories downloaded to this machine and the groups they provide.' },
  { id: 'answers', label: 'Answers', group: 'Workspace', icon: Brain, description: 'How the agent presents its answers: drawn components, and more preferences later.' },

  { id: 'memories', label: 'Memories', group: 'Data & privacy', icon: Brain, description: 'What the agent remembers about you and your work.' },
  { id: 'data-controls', label: 'Data controls', group: 'Data & privacy', icon: Shield, description: 'What is kept on this device, and how to remove it.' },

  { id: 'about', label: 'About', group: 'About', icon: Info, description: 'The version of SeshatOS and where it comes from.' },
  { id: 'cloud', label: 'SeshatCloud', group: 'About', icon: CloudStorage, description: 'Pair this desktop with the SeshatCloud of your organization: policies and minimum app version.' }
]

/** The sections an edition shows: the ones it hides (see lib/edition.ts) are left out. */
export function visibleSections(edition: Pick<Edition, 'cloud'>): SettingsSectionDef[] {
  return SETTINGS_SECTIONS.filter((section) => section.id !== 'cloud' || edition.cloud)
}

export function findSection(id: string | undefined, edition: Pick<Edition, 'cloud'>): SettingsSectionDef {
  const list = visibleSections(edition)
  return list.find((section) => section.id === id) ?? list[0]
}

/** The sections grouped in the order they are listed, for the navigation. */
export function groupSections(list: SettingsSectionDef[]): Array<[string, SettingsSectionDef[]]> {
  const groups = new Map<string, SettingsSectionDef[]>()
  for (const section of list) groups.set(section.group, [...(groups.get(section.group) ?? []), section])
  return [...groups.entries()]
}
