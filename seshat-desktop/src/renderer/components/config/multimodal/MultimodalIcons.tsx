import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'

export function CapabilityIcon({ name }: { name: 'image' | 'audio' | 'whisper' | 'custom' }) {
  const content = {
    image: (
      <>
        <rect width="28" height="28" rx="7" fill="#4263EB" />
        <path d="M7 19.5 11 15l3 3 2-2.5 5 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18.5" cy="9.5" r="2" fill="white" />
      </>
    ),
    audio: (
      <>
        <rect width="28" height="28" rx="7" fill="#6C4FD8" />
        <path d="M9 15v-2M14 18V10M19 16v-4" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    whisper: (
      <>
        <rect width="28" height="28" rx="7" fill="#2E6F67" />
        <path d="M14 7v8M10 11v3a4 4 0 0 0 8 0v-3M11 20h6M14 18v2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    custom: (
      <>
        <rect width="28" height="28" rx="7" fill="#3A3740" />
        <path d="M10 11 7.5 14 10 17M18 11l2.5 3L18 17M16 9l-4 10" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </>
    )
  }[name]

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="shrink-0" aria-hidden="true">
      {content}
    </svg>
  )
}

export function SourceIcon({ provider }: { provider: string }) {
  if (provider === 'custom') return <CapabilityIcon name="custom" />
  return <ProviderIcon provider={provider} size={28} className="shrink-0" />
}
