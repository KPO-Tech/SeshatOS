const providerStyles: Record<string, string> = {
  tavily: 'bg-[#2563eb] text-white',
  exa: 'bg-[#6d28d9] text-white',
  jina: 'bg-[#0f766e] text-white',
  langsearch: 'bg-[#b45309] text-white',
  searxng: 'bg-[#334155] text-white',
  serper: 'bg-[#dc2626] text-white'
}

export function WebSearchProviderIcon({ provider, label, size = 34 }: { provider: string; label: string; size?: number }) {
  const initials = (label || provider).slice(0, 2).toUpperCase()
  return (
    <span
      className={[
        'flex shrink-0 items-center justify-center rounded-lg text-[11px] font-bold',
        providerStyles[provider.toLowerCase()] || 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
      ].join(' ')}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
