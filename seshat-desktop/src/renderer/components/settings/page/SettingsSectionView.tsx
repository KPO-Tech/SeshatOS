import { AnswersConfig } from '@renderer/components/config/answers/AnswersConfig'
import { CloudConfig } from '@renderer/components/config/cloud/CloudConfig'
import { DocumentsConfig } from '@renderer/components/config/documents/DocumentsConfig'
import { EnvironmentConfig } from '@renderer/components/config/environment/EnvironmentConfig'
import { MCPConfig } from '@renderer/components/config/mcp/MCPConfig'
import { ModelsConfig } from '@renderer/components/config/models/ModelsConfig'
import { AudioConfig } from '@renderer/components/config/multimodal/AudioConfig'
import { ImageConfig } from '@renderer/components/config/multimodal/ImageConfig'
import { ProvidersConfig } from '@renderer/components/config/providers/ProvidersConfig'
import { SearchConfig } from '@renderer/components/config/search/SearchConfig'
import { SkillsConfig } from '@renderer/components/config/skills/SkillsConfig'
import { StorageConfig } from '@renderer/components/config/storage/StorageConfig'
import { TitlesConfig } from '@renderer/components/config/titles/TitlesConfig'
import { WebSearchConfig } from '@renderer/components/config/web-search/WebSearchConfig'
import { useAuth } from '@renderer/hooks/useAuth'
import { AboutSettings } from '../AboutSettings'
import { AccountSettings } from '../AccountSettings'
import { AppearanceSettings } from '../AppearanceSettings'
import { DataControlsSettings } from '../DataControlsSettings'
import { GeneralSettings } from '../GeneralSettings'
import { MemoriesSettings } from '../MemoriesSettings'
import { ShortcutsSettings } from '../ShortcutsSettings'
import { SettingsPage } from '../kit'
import type { SettingsSectionId } from './sections'
import { useSettingsState } from './useSettingsState'

/** Pages that draw their own header with the kit; the others are framed here until they are moved over. */
const KIT_PAGES: ReadonlySet<SettingsSectionId> = new Set(['general', 'appearance', 'shortcuts', 'account', 'audio', 'skills'])

/** The content of one page of Settings. */
export function SettingsSectionView({ id }: { id: SettingsSectionId }) {
  const view = <SectionContent id={id} />
  return KIT_PAGES.has(id) ? view : <SettingsPage id={id}>{view}</SettingsPage>
}

function SectionContent({ id }: { id: SettingsSectionId }) {
  const { user, logout } = useAuth()
  const state = useSettingsState()

  switch (id) {
    case 'general':
      return (
        <GeneralSettings
          language={state.language}
          notifications={state.notifications}
          soundAlert={state.soundAlert}
          productUpdates={state.productUpdates}
          onLanguageChange={state.updateLanguage}
          onNotificationsChange={state.setNotifications}
          onSoundAlertChange={state.setSoundAlert}
          onProductUpdatesChange={state.setProductUpdates}
        />
      )
    case 'appearance':
      return <AppearanceSettings theme={state.theme} onThemeChange={state.setTheme} />
    case 'shortcuts':
      return <ShortcutsSettings />
    case 'account':
      return user ? <AccountSettings user={user} displayName={user.display_name || user.email} onLogout={() => void logout()} /> : null
    case 'providers':
      return <ProvidersConfig />
    case 'models':
      return <ModelsConfig />
    case 'titles':
      return <TitlesConfig />
    case 'web-search':
      return <WebSearchConfig />
    case 'documents':
      return <DocumentsConfig />
    case 'search':
      return <SearchConfig />
    case 'image':
      return <ImageConfig />
    case 'audio':
      return <AudioConfig />
    case 'mcp':
      return <MCPConfig />
    case 'environment':
      return <EnvironmentConfig />
    case 'storage':
      return <StorageConfig />
    case 'skills':
      return <SkillsConfig />
    case 'answers':
      return <AnswersConfig />
    case 'memories':
      return <MemoriesSettings />
    case 'data-controls':
      return <DataControlsSettings />
    case 'about':
      return <AboutSettings />
    case 'cloud':
      return <CloudConfig />
  }
}
