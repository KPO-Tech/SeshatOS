import { KNOWLEDGE_NAV, type KnowledgeTab } from '../nav'

const ABOUT: Record<Exclude<KnowledgeTab, 'ask'>, { title: string; text: string }> = {
  search: {
    title: 'Find a document by keyword',
    text: 'A search engine for your organization’s own data. No model involved: the same words give the same results, filtered by collection, source, type and date.'
  },
  collections: {
    title: 'Browse what is inside',
    text: 'Every collection with its documents, their source and their last update, and a way to open any of them.'
  },
  sources: {
    title: 'Connect and follow your sources',
    text: 'Connect Drive, SharePoint, Confluence and more, see how each synchronization is going, and learn why a document is missing.'
  },
  settings: {
    title: 'Choose the models and the access',
    text: 'The embedding and reranking models of the organization, and who can read which collection.'
  }
}

export function ComingNext({ tab }: { tab: Exclude<KnowledgeTab, 'ask'> }) {
  const item = KNOWLEDGE_NAV.flatMap((group) => group.items).find((entry) => entry.id === tab)
  const about = ABOUT[tab]
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 pb-16 text-center" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
      <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-primary)] [&_svg]:size-[22px]">{item?.icon}</span>
      <p className="mb-0 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{item?.label} · designed, not built yet</p>
      <h1 className="mb-0 mt-2 text-[28px] font-normal leading-[1.2] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
        {about.title}
      </h1>
      <p className="mb-0 mt-3 max-w-[440px] text-[13.5px] leading-[21px] text-[var(--text-muted)]">{about.text}</p>
    </div>
  )
}
