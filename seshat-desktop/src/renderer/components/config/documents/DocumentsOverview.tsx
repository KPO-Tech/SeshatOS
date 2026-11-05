import { Computer, FileText, Link, Server } from '@icon-park/react'
import { ActionButton, Chip, SelectField, SettingRow, SettingsCard, StatusBadge, Toggle, type SelectOption, type Tone } from '../../settings/kit'
import type { DocumentReaderState } from './useDocumentReader'
import { useTranslation } from 'react-i18next'

const glyph = (Icon: typeof Server) => <Icon theme="outline" size={16} />

const READERS: SelectOption[] = [
  { value: 'local', label: 'config:documents.documentsOverview.builtInReaders' },
  { value: 'external', label: 'config:documents.documentsOverview.documentServer' }
]

const ready = (on: boolean): Tone => (on ? 'ok' : 'muted')

/** The first tab: whether documents are read, which reader goes first, and what each reader can do on this computer. */
export function DocumentsOverview({ reader }: { reader: DocumentReaderState }) {
  const { t } = useTranslation('config')
  const { form, update, test } = reader
  const reachable = reader.externalReachable
  const serverTone: Tone = reachable === true ? 'ok' : 'muted'
  const serverLabel = reachable === true ? t('documents.documentsOverview.reachable') : reachable === false ? t('documents.documentsOverview.notReachable') : reader.externalConfigured ? t('documents.documentsOverview.configured') : t('documents.documentsOverview.notSet')

  return (
    <>
      <SettingsCard>
        <SettingRow title={t('documents.documentsOverview.readDocuments')} icon={glyph(FileText)} hint={form.enabled ? undefined : t('documents.documentsOverview.theAgentsOnlySeeThe')}>
          <Toggle label={t('documents.documentsOverview.readDocuments')} enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title={t('documents.documentsOverview.reader')}>
        <SettingRow title={t('documents.documentsOverview.readerFirst')} icon={glyph(Computer)}>
          <div className="w-[210px]">
            <SelectField value={form.prefer_external ? 'external' : 'local'} options={READERS.map((option) => ({ ...option, label: t(option.label) }))} onChange={(value) => update('prefer_external', value === 'external')} />
          </div>
        </SettingRow>
        <SettingRow title={t('documents.documentsOverview.server')} icon={glyph(Link)}>
          <input
            value={form.base_url}
            onChange={(event) => update('base_url', event.target.value)}
            placeholder="http://localhost:5100"
            aria-label={t('documents.documentsOverview.documentServerAddress')}
            className="h-9 w-[250px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
          <StatusBadge tone={serverTone}>{serverLabel}</StatusBadge>
          <ActionButton type="button" disabled={!form.base_url || test.state === 'running'} onClick={() => void reader.runTest()}>
            {test.state === 'running' ? t('documents.documentsOverview.testing') : t('documents.documentsOverview.test')}
          </ActionButton>
        </SettingRow>
        {(test.state === 'ok' || test.state === 'error') && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {test.state === 'error' && <span className="text-[12px] text-[var(--accent-danger)]">{test.error || t('documents.documentsOverview.theServerDidNotAnswer')}</span>}
            {test.state === 'ok' && <Chip tone="ok">{t('documents.documentsOverview.connectedIn', { ms: test.latency ?? 0 })}</Chip>}
            {test.capabilities && (
              <>
                <Chip tone={ready(test.capabilities.conversion === true)}>{t('documents.documentsOverview.conversion')}</Chip>
                <Chip tone={ready(test.capabilities.hybrid === true)}>{t('documents.documentsOverview.chunking')}</Chip>
              </>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title={t('documents.documentsOverview.onThisComputer')} padded>
        <div className="flex flex-wrap gap-2">
          <Chip tone={ready(reader.localBasicAvailable)}>{t('documents.documentsOverview.builtInReaders')}</Chip>
          <Chip tone={ready(reader.pdfSmartAvailable)}>{t('documents.documentsOverview.pdfPages')}</Chip>
          <Chip tone={ready(reader.native.ready)}>{reader.native.ready ? t('documents.documentsOverview.scannedPages') : t('documents.documentsOverview.scannedPagesDetail', { detail: reader.native.detail })}</Chip>
          <Chip tone={ready(reader.visionConfigured)}>{t('documents.documentsOverview.visionFallback')}</Chip>
          <Chip tone={ready(reader.hybridConfigured)}>{t('documents.documentsOverview.chunking')}</Chip>
        </div>
      </SettingsCard>
    </>
  )
}
