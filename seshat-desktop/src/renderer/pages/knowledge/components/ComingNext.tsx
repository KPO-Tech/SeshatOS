import { useTranslation } from 'react-i18next'
import { KNOWLEDGE_NAV, type KnowledgeTab } from '../nav'

const ABOUT: Record<Exclude<KnowledgeTab, 'ask'>, { title: string; text: string }> = {
  search: {
    title: 'knowledge/components:pages.knowledge.components.comingNext.searchTitle',
    text: 'knowledge/components:pages.knowledge.components.comingNext.searchText'
  },
  collections: {
    title: 'knowledge/components:pages.knowledge.components.comingNext.collectionsTitle',
    text: 'knowledge/components:pages.knowledge.components.comingNext.collectionsText'
  },
  sources: {
    title: 'knowledge/components:pages.knowledge.components.comingNext.sourcesTitle',
    text: 'knowledge/components:pages.knowledge.components.comingNext.sourcesText'
  },
  settings: {
    title: 'knowledge/components:pages.knowledge.components.comingNext.settingsTitle',
    text: 'knowledge/components:pages.knowledge.components.comingNext.settingsText'
  }
}

export function ComingNext({ tab }: { tab: Exclude<KnowledgeTab, 'ask'> }) {
  const { t } = useTranslation('knowledge/components')
  const item = KNOWLEDGE_NAV.flatMap((group) => group.items).find((entry) => entry.id === tab)
  const about = ABOUT[tab]
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-16 text-center" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-primary)] [&_svg]:size-[22px]">{item?.icon}</span>
      <p className="mb-0 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item ? t(item.label) : ''} {t('knowledge/components:pages.knowledge.components.comingNext.designedNotBuilt')}</p>
      <h1 className="mb-0 mt-2 text-[28px] font-normal leading-[1.2] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        {t(about.title)}
      </h1>
      <p className="mb-0 mt-3 max-w-[440px] text-[13.5px] leading-[21px] text-[var(--text-muted)]">{t(about.text)}</p>
    </div>
  )
}
