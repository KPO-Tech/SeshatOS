import { Computer, FileText, Link, Server } from '@icon-park/react'
import { ActionButton, Chip, SelectField, SettingRow, SettingsCard, StatusBadge, Toggle, type SelectOption, type Tone } from '../../settings/kit'
import type { DocumentReaderState } from './useDocumentReader'

const glyph = (Icon: typeof Server) => <Icon theme="outline" size={16} />

const READERS: SelectOption[] = [
  { value: 'local', label: 'Built-in readers' },
  { value: 'external', label: 'Document server' }
]

const ready = (on: boolean): Tone => (on ? 'ok' : 'muted')

/** The first tab: whether documents are read, which reader goes first, and what each reader can do on this computer. */
export function DocumentsOverview({ reader }: { reader: DocumentReaderState }) {
  const { form, update, test } = reader
  const reachable = reader.externalReachable
  const serverTone: Tone = reachable === true ? 'ok' : 'muted'
  const serverLabel = reachable === true ? 'Reachable' : reachable === false ? 'Not reachable' : reader.externalConfigured ? 'Configured' : 'Not set'

  return (
    <>
      <SettingsCard>
        <SettingRow title="Read documents" icon={glyph(FileText)} hint={form.enabled ? undefined : 'The agents only see the text you type.'}>
          <Toggle label="Read documents" enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Reader">
        <SettingRow title="Reader first" icon={glyph(Computer)}>
          <div className="w-[210px]">
            <SelectField value={form.prefer_external ? 'external' : 'local'} options={READERS} onChange={(value) => update('prefer_external', value === 'external')} />
          </div>
        </SettingRow>
        <SettingRow title="Server" icon={glyph(Link)}>
          <input
            value={form.base_url}
            onChange={(event) => update('base_url', event.target.value)}
            placeholder="http://localhost:5100"
            aria-label="Document server address"
            className="h-9 w-[250px] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 font-mono text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
          <StatusBadge tone={serverTone}>{serverLabel}</StatusBadge>
          <ActionButton type="button" disabled={!form.base_url || test.state === 'running'} onClick={() => void reader.runTest()}>
            {test.state === 'running' ? 'Testing...' : 'Test'}
          </ActionButton>
        </SettingRow>
        {(test.state === 'ok' || test.state === 'error') && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {test.state === 'error' && <span className="text-[12px] text-[var(--accent-danger)]">{test.error || 'The server did not answer.'}</span>}
            {test.state === 'ok' && <Chip tone="ok">{`Connected in ${test.latency ?? 0} ms`}</Chip>}
            {test.capabilities && (
              <>
                <Chip tone={ready(test.capabilities.conversion === true)}>Conversion</Chip>
                <Chip tone={ready(test.capabilities.hybrid === true)}>Chunking</Chip>
              </>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard title="On this computer" padded>
        <div className="flex flex-wrap gap-2">
          <Chip tone={ready(reader.localBasicAvailable)}>Built-in readers</Chip>
          <Chip tone={ready(reader.pdfSmartAvailable)}>PDF pages</Chip>
          <Chip tone={ready(reader.native.ready)}>{reader.native.ready ? 'Scanned pages' : `Scanned pages: ${reader.native.detail}`}</Chip>
          <Chip tone={ready(reader.visionConfigured)}>Vision fallback</Chip>
          <Chip tone={ready(reader.hybridConfigured)}>Chunking</Chip>
        </div>
      </SettingsCard>
    </>
  )
}
