import { ConnectorsConfig } from './ConnectorsConfig'

// Where the documents of Knowledge come from: Drive, SharePoint, S3. An account connected here is synchronized into a collection.
// The connectors the agent uses as tools (with an API key) are another thing, in the Plugins page.
export function SourcesPage() {
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-10">
      <div className="mx-auto w-full max-w-[880px]" style={{ animation: 'slide-up 360ms cubic-bezier(0.22, 1, 0.36, 1) both' }}>
        <h1 className="m-0 text-[30px] font-normal leading-[1.15] tracking-[-0.01em] text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-app-serif)' }}>
          Sources
        </h1>
        <p className="mb-0 mt-2 text-[13.5px] leading-[21px] text-[var(--text-muted)]">Connect the places your documents live, and synchronize them into a collection.</p>
        <div className="mt-7">
          <ConnectorsConfig />
        </div>
      </div>
    </div>
  )
}
