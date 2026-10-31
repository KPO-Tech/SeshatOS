import { useLocation, useNavigate, useParams } from 'react-router'
import { Left, Right } from '@icon-park/react'
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
import { edition } from '@renderer/lib/edition'
import { AboutSettings } from '../AboutSettings'
import { AccountSettings } from '../AccountSettings'
import { AppearanceSettings } from '../AppearanceSettings'
import { DataControlsSettings } from '../DataControlsSettings'
import { GeneralSettings } from '../GeneralSettings'
import { MemoriesSettings } from '../MemoriesSettings'
import { ShortcutsSettings } from '../ShortcutsSettings'
import { findSection, type SettingsSectionId } from './sections'
import { useSettingsState } from './useSettingsState'

/** A page of Settings: the way back and where we are, what the page is for, then the page itself. */
export function SettingsPage() {
  const { section: param } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const state = useSettingsState()
  const def = findSection(param, edition)
  const Icon = def.icon
  const from = (location.state as { from?: string } | null)?.from

  function content(id: SettingsSectionId) {
    const displayName = user?.display_name || user?.email || ''
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
        return user ? <AccountSettings user={user} displayName={displayName} onLogout={() => void logout()} /> : null
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

  return (
    <section className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-10 pt-5">
      <div className="w-full max-w-[1100px]">
        <nav className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]" aria-label="Where you are">
          <button type="button" onClick={() => navigate(from ?? '/')} aria-label="Back" title="Back" className="flex size-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]">
            <Left theme="outline" size={16} />
          </button>
          <span>Settings</span>
          <Right theme="outline" size={12} />
          <span className="font-medium text-[var(--text-primary)]">{def.label}</span>
        </nav>

        <header className="mt-4 flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent-primary)_16%,transparent)] text-[var(--accent-primary)]">
            <Icon theme="filled" size={28} fill="currentColor" />
          </span>
          <div className="min-w-0">
            <h1 className="m-0 text-[24px] font-semibold leading-tight text-[var(--text-primary)]">{def.label}</h1>
            <p className="m-0 mt-1 max-w-[720px] text-[13px] leading-5 text-[var(--text-muted)]">{def.description}</p>
          </div>
        </header>

        <div className="mt-6 border-t border-[var(--border-soft)] pt-6">{content(def.id)}</div>
      </div>
    </section>
  )
}
