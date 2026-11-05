import { Dropdown, type DropdownItem } from '@renderer/components/ui/Dropdown'
import { FORMATS, SORTS, STATES, type DocumentFormat, type DocumentView, type SortKey, type StateFilter } from './documentOrder'
import { useTranslation } from 'react-i18next'

type Props = {
  view: DocumentView
  onChange: (view: DocumentView) => void
  shown: number
  total: number
  failed: number
  retrying: boolean
  onRetryFailed: () => void
}

const BUTTON =
  'flex cursor-pointer items-center gap-1.5 rounded-lg border border-app-border-subtle bg-transparent px-2.5 py-1.5 text-[12.5px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]'

/** A choice among a few, as a button that opens a menu drawn in the colours of the app (a native list is not, in a dark appearance). */
function Choice<T extends string>({ label, value, options, onSelect, prefix }: { label: string; value: T; options: ReadonlyArray<{ id: T; label: string }>; onSelect: (value: T) => void; prefix?: string }) {
  const { t } = useTranslation('knowledge/collections')
  const items: DropdownItem[] = options.map((option) => ({ id: option.id, label: t(option.label), checked: option.id === value, onSelect: () => onSelect(option.id) }))
  const current = options.find((option) => option.id === value)?.label
  const currentLabel = current ? t(current) : ''
  return (
    <Dropdown
      label={label}
      align="left"
      items={items}
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} aria-haspopup="menu" aria-label={label} className={BUTTON}>
          {prefix && <span className="text-[var(--text-muted)]">{prefix}</span>}
          <span className="text-[var(--text-primary)]">{currentLabel}</span>
          <span className="text-[var(--text-muted)]">&#9662;</span>
        </button>
      )}
    />
  )
}

/** Sort and filter of the documents of a collection, and the one button that starts every failed document again. */
export function DocumentToolbar({ view, onChange, shown, total, failed, retrying, onRetryFailed }: Props) {
  const { t } = useTranslation('knowledge/collections')
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Choice<SortKey> label={t('pages.knowledge.collections.documentToolbar.sortTheDocuments')} prefix={t('pages.knowledge.collections.documentToolbar.sort')} value={view.sort} options={SORTS} onSelect={(sort) => onChange({ ...view, sort })} />
      <Choice<DocumentFormat | 'all'>
        label={t('pages.knowledge.collections.documentToolbar.filterByFormat')}
        value={view.format}
        options={[{ id: 'all', label: 'knowledge/collections:pages.knowledge.collections.documentToolbar.anyFormat' }, ...FORMATS]}
        onSelect={(format) => onChange({ ...view, format })}
      />
      <Choice<StateFilter> label={t('pages.knowledge.collections.documentToolbar.filterByState')} value={view.state} options={STATES} onSelect={(state) => onChange({ ...view, state })} />
      {shown !== total && <span className="text-[12px] text-[var(--text-muted)]">{t('pages.knowledge.collections.documentToolbar.shownOf', { shown, documents: t('pages.knowledge.collections.counts.document', { count: total }) })}</span>}
      {failed > 0 && (
        <button
          type="button"
          onClick={onRetryFailed}
          disabled={retrying}
          className="ml-auto cursor-pointer rounded-lg border border-app-border-subtle bg-transparent px-2.5 py-1.5 text-[12.5px] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {retrying ? t('pages.knowledge.collections.documentToolbar.starting') : t('pages.knowledge.collections.documentToolbar.retryFailed', { documents: t('pages.knowledge.collections.counts.failedDocument', { count: failed }) })}
        </button>
      )}
    </div>
  )
}
