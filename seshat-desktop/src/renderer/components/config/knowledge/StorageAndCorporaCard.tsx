import { ConfigCard, StatusPill } from './KnowledgePrimitives'
import type { Corpus, StorageStatus } from './knowledgeTypes'

export function StorageAndCorporaCard({ storage, corpora }: { storage: StorageStatus | null; corpora: Corpus[] }) {
  const chunks = corpora.reduce((total, corpus) => total + (corpus.chunk_count ?? 0), 0)

  return (
    <ConfigCard
      title="Storage and corpora"
      description="Current knowledge storage state and indexed collections."
      status={<StatusPill tone={storage?.restart_required ? 'warn' : 'ok'}>{storage?.restart_required ? 'Restart required' : 'Active'}</StatusPill>}
    >
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <InfoTile label="Active storage" value={storage?.active_provider || 'local'} />
          <InfoTile label="Configured" value={storage?.config.provider || 'local'} />
          <InfoTile label="Indexed chunks" value={String(chunks)} />
        </div>

        {corpora.length > 0 ? (
          <div className="grid gap-2">
            {corpora.slice(0, 5).map((corpus) => (
              <div key={corpus.id} className="flex min-h-10 items-center justify-between gap-4 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{corpus.name}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{corpus.file_count ?? 0} files</div>
                </div>
                <div className="shrink-0 text-[12px] font-semibold text-[var(--text-secondary)]">{corpus.chunk_count ?? 0} chunks</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--border-soft)] px-4 py-7 text-center text-[13px] font-semibold text-[var(--text-muted)]">
            No corpus indexed yet.
          </div>
        )}
      </div>
    </ConfigCard>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
      <div className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 truncate text-[14px] font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  )
}
