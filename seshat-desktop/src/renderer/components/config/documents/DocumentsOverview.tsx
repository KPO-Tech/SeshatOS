import type { ReactNode } from 'react'
import { ToggleSwitch } from '../knowledge/KnowledgePrimitives'
import type { DocumentReaderState } from './useDocumentReader'

export function Card({ title, hint, children, action }: { title: string; hint?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
          {hint && <p className="m-0 mt-1 text-[12.5px] leading-5 text-[var(--text-muted)]">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function Chip({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 py-1.5 text-[12px]" title={detail}>
      <span className={`size-2 shrink-0 rounded-full ${ready ? 'bg-[var(--accent-success)]' : 'bg-[var(--text-faint)]'}`} />
      <span className="text-[var(--text-primary)]">{label}</span>
      <span className={ready ? 'text-[var(--accent-success)]' : 'text-[var(--text-muted)]'}>{detail}</span>
    </span>
  )
}

function Mode({ selected, title, text, onSelect }: { selected: boolean; title: string; text: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left ${selected ? 'border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)]' : 'border-[var(--border-soft)] bg-transparent hover:bg-[var(--surface-hover)]'}`}
    >
      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[var(--accent-primary)]' : 'border-[var(--border-strong)]'}`}>
        {selected && <span className="size-1.5 rounded-full bg-[var(--accent-primary)]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-[17px] text-[var(--text-muted)]">{text}</span>
      </span>
    </button>
  )
}

/** The first tab: whether documents are read at all, which reader goes first, and what each reader can do on this machine. */
export function DocumentsOverview({ reader }: { reader: DocumentReaderState }) {
  const { form, update, test } = reader
  const reachable = reader.externalReachable
  const serverStatus = reachable === true ? 'Reachable' : reachable === false ? 'Check failed' : reader.externalConfigured ? 'Configured' : 'Optional'

  return (
    <div className="grid gap-4">
      <Card
        title="Enable documents"
        hint="Let the agents read, analyze and pull information out of your documents."
        action={<ToggleSwitch enabled={form.enabled} onChange={(enabled) => update('enabled', enabled)} />}
      >
        <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{form.enabled ? 'The agents can read the files you attach and the documents of your projects.' : 'Documents are not read: the agents only see the text you type.'}</p>
      </Card>

      <Card title="Document reader" hint="Use a document server for scans, files with a heavy layout and conversions, or the readers built into SeshatOS.">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-[var(--text-muted)]">Server URL</span>
          <input
            value={form.base_url}
            onChange={(event) => update('base_url', event.target.value)}
            placeholder="http://localhost:5100"
            className="h-10 min-w-[220px] flex-1 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-root)] px-3 font-mono text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
          <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${reachable === true ? 'bg-[color-mix(in_srgb,var(--accent-success)_16%,transparent)] text-[var(--accent-success)]' : reachable === false ? 'bg-[color-mix(in_srgb,var(--accent-danger)_16%,transparent)] text-[var(--accent-danger)]' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'}`}>{serverStatus}</span>
          <button type="button" disabled={!form.base_url || test.state === 'running'} onClick={() => void reader.runTest()} className="h-10 cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-4 text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50">
            {test.state === 'running' ? 'Testing...' : 'Test'}
          </button>
        </div>
        {test.state === 'ok' && <p className="m-0 mt-2 text-[12px] text-[var(--accent-success)]">Connected in {test.latency ?? 0} ms.</p>}
        {test.state === 'error' && <p className="m-0 mt-2 text-[12px] text-[var(--accent-danger)]">{test.error || 'The server did not answer.'}</p>}
        {test.capabilities && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="Health" ready={test.capabilities.reachable === true} detail={test.capabilities.reachable ? 'Reachable' : 'Unreachable'} />
            <Chip label="Conversion" ready={test.capabilities.conversion === true} detail={test.capabilities.conversion ? 'Available' : test.capabilities.conversionError || 'Unavailable'} />
            <Chip label="Chunking" ready={test.capabilities.hybrid === true} detail={test.capabilities.hybrid ? 'Available' : test.capabilities.hybridError || 'Unavailable'} />
          </div>
        )}

        <div className="mt-4 text-[12px] font-semibold text-[var(--text-muted)]">Which reader goes first</div>
        <div role="radiogroup" aria-label="Which reader goes first" className="mt-2 grid gap-2.5 sm:grid-cols-2">
          <Mode selected={form.prefer_external} title="External reader" text="The server reads and cuts the document first; the built-in readers take over when it cannot." onSelect={() => update('prefer_external', true)} />
          <Mode selected={!form.prefer_external} title="Local built-in readers" text="The built-in readers go first (faster); the chunks are cut from the text they write." onSelect={() => update('prefer_external', false)} />
        </div>
      </Card>

      <Card title="Reader capabilities" hint="What each reader can do on this computer, as detected now.">
        <div className="flex flex-wrap gap-2">
          <Chip label="Built-in readers" ready={reader.localBasicAvailable} detail={reader.localBasicAvailable ? 'Available' : 'Review'} />
          <Chip label="PDF with pages" ready={reader.pdfSmartAvailable} detail={reader.pdfSmartAvailable ? 'Available' : 'Unavailable'} />
          <Chip label="Native OCR" ready={reader.native.ready} detail={reader.native.detail} />
          <Chip label="Vision fallback" ready={reader.visionConfigured} detail={reader.visionConfigured ? 'Configured' : 'Not set'} />
          <Chip label="External reader" ready={reachable ?? reader.externalConfigured} detail={serverStatus} />
          <Chip label="External conversion" ready={reader.externalConversion ?? reader.externalConfigured} detail={reader.externalConversion === false ? reader.externalConversionError || 'Unavailable' : reader.externalConversion ? 'Available' : reader.externalConfigured ? 'Configured' : 'Optional'} />
          <Chip label="Hybrid chunking" ready={reader.hybridConfigured} detail={reader.hybridConfigured ? 'Available' : reader.hybridError || 'Fallback'} />
        </div>
      </Card>
    </div>
  )
}
