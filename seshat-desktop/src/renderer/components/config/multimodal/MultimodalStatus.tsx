import type { LocalSTTConfig, SystemStatus } from './multimodalTypes'

export function MultimodalStatus({ status, localSTT, imageLinked, audioLinked }: { status: SystemStatus | null; localSTT: LocalSTTConfig | null; imageLinked: boolean; audioLinked: boolean }) {
  const items = [
    {
      label: 'Image',
      value: imageLinked ? 'Ready' : 'Review',
      detail: imageLinked ? 'Provider linked' : 'OpenAI or Gemini',
      tone: imageLinked ? 'success' : 'primary'
    },
    {
      label: 'Voice',
      value: status?.local_stt_configured || localSTT?.enabled ? 'Local' : 'Cloud',
      detail: localSTT?.base_url || 'Audio fallback',
      tone: status?.local_stt_configured || localSTT?.enabled ? 'success' : 'muted'
    },
    {
      label: 'Audio',
      value: audioLinked ? 'Ready' : 'Review',
      detail: audioLinked ? 'Provider linked' : 'OpenAI provider',
      tone: audioLinked ? 'success' : 'primary'
    },
    {
      label: 'Runtime',
      value: status?.mode || 'standalone',
      detail: status?.server_url || 'Local backend',
      tone: 'muted'
    }
  ]

  return (
    <section className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <article key={item.label} className="min-w-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-[11px] font-semibold text-[var(--text-muted)]">{item.label}</div>
            <span
              className={[
                'size-1.5 rounded-full',
                item.tone === 'success' ? 'bg-[var(--accent-success)]' : '',
                item.tone === 'primary' ? 'bg-[var(--accent-primary)]' : '',
                item.tone === 'muted' ? 'bg-[var(--text-faint)]' : ''
              ].join(' ')}
            />
          </div>
          <div className="mt-1.5 truncate text-[16px] font-semibold leading-none text-[var(--text-primary)]">{item.value}</div>
          <div className="mt-1.5 truncate text-[11px] text-[var(--text-muted)]">{item.detail}</div>
        </article>
      ))}
    </section>
  )
}
