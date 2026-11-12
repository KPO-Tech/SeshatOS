import type { ComponentType } from 'react'
import { Brain, Chip, CloudStorage, Contrast, Cube, DataServer, FileText, Info, Keyboard, Magic, MindMapping, Music, Pic, Plug, Robot, Search, Shield, Terminal, Translate, User } from '@icon-park/react'
import type { Edition } from '@renderer/lib/edition'

/** Every page of Settings: what used to be in Settings and in Config now live under one roof. */
export type SettingsSectionId =
  | 'language-notifications'
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
  | 'memories'
  | 'data-controls'
  | 'about'
  | 'cloud'

type IconComponent = ComponentType<{ theme?: 'outline' | 'filled'; size?: number | string; fill?: string }>

/** The headings the pages are listed under in the navigation. */
export type SettingsGroupId = 'general' | 'aiRuntime' | 'capabilities' | 'workspace' | 'dataPrivacy' | 'about'

/** The text of a heading, as a key of the settings catalogue. */
export const GROUP_KEYS: Record<SettingsGroupId, string> = {
  general: 'settings:groups.general',
  aiRuntime: 'settings:groups.aiRuntime',
  capabilities: 'settings:groups.capabilities',
  workspace: 'settings:groups.workspace',
  dataPrivacy: 'settings:groups.dataPrivacy',
  about: 'settings:groups.about'
}

// A page names its text by key, not by sentence: the navigation and the header of the page translate them when they draw.
export type SettingsSectionDef = {
  id: SettingsSectionId
  labelKey: string
  group: SettingsGroupId
  icon: IconComponent
  descriptionKey: string
}

export const SETTINGS_SECTIONS: SettingsSectionDef[] = [
  { id: 'account', group: 'general', icon: User, labelKey: 'settings:sections.account.label', descriptionKey: 'settings:sections.account.description' },
  { id: 'language-notifications', group: 'general', icon: Translate, labelKey: 'settings:sections.languageNotifications.label', descriptionKey: 'settings:sections.languageNotifications.description' },
  { id: 'appearance', group: 'general', icon: Contrast, labelKey: 'settings:sections.appearance.label', descriptionKey: 'settings:sections.appearance.description' },
  { id: 'shortcuts', group: 'general', icon: Keyboard, labelKey: 'settings:sections.shortcuts.label', descriptionKey: 'settings:sections.shortcuts.description' },

  { id: 'providers', group: 'aiRuntime', icon: Cube, labelKey: 'settings:sections.providers.label', descriptionKey: 'settings:sections.providers.description' },
  { id: 'models', group: 'aiRuntime', icon: Chip, labelKey: 'settings:sections.models.label', descriptionKey: 'settings:sections.models.description' },
  { id: 'titles', group: 'aiRuntime', icon: Magic, labelKey: 'settings:sections.titles.label', descriptionKey: 'settings:sections.titles.description' },
  { id: 'web-search', group: 'aiRuntime', icon: Search, labelKey: 'settings:sections.webSearch.label', descriptionKey: 'settings:sections.webSearch.description' },

  { id: 'documents', group: 'capabilities', icon: FileText, labelKey: 'settings:sections.documents.label', descriptionKey: 'settings:sections.documents.description' },
  { id: 'search', group: 'capabilities', icon: MindMapping, labelKey: 'settings:sections.search.label', descriptionKey: 'settings:sections.search.description' },
  { id: 'image', group: 'capabilities', icon: Pic, labelKey: 'settings:sections.image.label', descriptionKey: 'settings:sections.image.description' },
  { id: 'audio', group: 'capabilities', icon: Music, labelKey: 'settings:sections.audio.label', descriptionKey: 'settings:sections.audio.description' },

  { id: 'mcp', group: 'workspace', icon: Plug, labelKey: 'settings:sections.mcp.label', descriptionKey: 'settings:sections.mcp.description' },
  { id: 'environment', group: 'workspace', icon: Terminal, labelKey: 'settings:sections.environment.label', descriptionKey: 'settings:sections.environment.description' },
  { id: 'storage', group: 'workspace', icon: DataServer, labelKey: 'settings:sections.storage.label', descriptionKey: 'settings:sections.storage.description' },
  { id: 'skills', group: 'workspace', icon: Robot, labelKey: 'settings:sections.skills.label', descriptionKey: 'settings:sections.skills.description' },

  { id: 'memories', group: 'dataPrivacy', icon: Brain, labelKey: 'settings:sections.memories.label', descriptionKey: 'settings:sections.memories.description' },
  { id: 'data-controls', group: 'dataPrivacy', icon: Shield, labelKey: 'settings:sections.dataControls.label', descriptionKey: 'settings:sections.dataControls.description' },

  { id: 'about', group: 'about', icon: Info, labelKey: 'settings:sections.about.label', descriptionKey: 'settings:sections.about.description' },
  { id: 'cloud', group: 'about', icon: CloudStorage, labelKey: 'settings:sections.cloud.label', descriptionKey: 'settings:sections.cloud.description' }
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
export function groupSections(list: SettingsSectionDef[]): Array<[SettingsGroupId, SettingsSectionDef[]]> {
  const groups = new Map<SettingsGroupId, SettingsSectionDef[]>()
  for (const section of list) groups.set(section.group, [...(groups.get(section.group) ?? []), section])
  return [...groups.entries()]
}
