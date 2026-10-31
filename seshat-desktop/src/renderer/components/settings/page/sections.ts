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
  { id: 'appearance', label: 'Appearance', group: 'General', icon: Contrast, description: 'Theme, colors and size.' },
  { id: 'shortcuts', label: 'Shortcuts', group: 'General', icon: Keyboard, description: 'Keys to move around quickly.' },
  { id: 'account', label: 'Account', group: 'General', icon: User, description: 'Who you are on this device.' },

  { id: 'providers', label: 'Providers', group: 'AI runtime', icon: Cube, description: 'The AI providers your agents use.' },
  { id: 'models', label: 'Models', group: 'AI runtime', icon: Chip, description: 'Defaults, catalogs and fallbacks.' },
  { id: 'titles', label: 'Titles', group: 'AI runtime', icon: Magic, description: 'Name new sessions with a small local model.' },
  { id: 'web-search', label: 'Web search', group: 'AI runtime', icon: Search, description: 'Search providers and web rules.' },

  { id: 'documents', label: 'Documents', group: 'Capabilities', icon: FileText, description: 'How documents are read for your agents.' },
  { id: 'search', label: 'Search', group: 'Capabilities', icon: MindMapping, description: 'Embedding and reranking for Knowledge.' },
  { id: 'image', label: 'Images', group: 'Capabilities', icon: Pic, description: 'How the agent creates images.' },
  { id: 'audio', label: 'Audio', group: 'Capabilities', icon: Music, description: 'Dictation, transcription and voice.' },

  { id: 'mcp', label: 'MCP servers', group: 'Workspace', icon: Plug, description: 'MCP servers for agents and tools.' },
  { id: 'environment', label: 'Environment', group: 'Workspace', icon: Terminal, description: 'API keys and environment variables.' },
  { id: 'storage', label: 'Storage', group: 'Workspace', icon: DataServer, description: 'Where files and caches live.' },
  { id: 'skills', label: 'Skill repositories', group: 'Workspace', icon: Robot, description: 'Skill repositories on this machine.' },
  { id: 'answers', label: 'Answers', group: 'Workspace', icon: Brain, description: 'How the agent presents answers.' },

  { id: 'memories', label: 'Memories', group: 'Data & privacy', icon: Brain, description: 'What the agent remembers.' },
  { id: 'data-controls', label: 'Data controls', group: 'Data & privacy', icon: Shield, description: 'What is kept on this device.' },

  { id: 'about', label: 'About', group: 'About', icon: Info, description: 'Version and origin of SeshatOS.' },
  { id: 'cloud', label: 'SeshatCloud', group: 'About', icon: CloudStorage, description: 'Pair with your organization SeshatCloud.' }
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
