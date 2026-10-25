import type { AgentConfigEntry } from './agentTypes'

const palette = ['#ef7c2f', '#6b39cb', '#10a37f', '#4285f4', '#d97757', '#7d9ccf', '#44b783', '#c89a6a']

function colorFor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

function parseSeed(icon: string | undefined, slug: string) {
  const trimmed = icon?.trim()
  if (!trimmed) return slug || 'agent'
  const separator = trimmed.indexOf(':')
  return separator > 0 ? trimmed.slice(separator + 1) : trimmed
}

function isEmoji(icon: string) {
  return /\p{Extended_Pictographic}/u.test(icon)
}

export function AgentAvatar({ agent, size = 44 }: { agent: AgentConfigEntry; size?: number }) {
  const icon = agent.icon?.trim() ?? ''
  const radius = Math.round(size * 0.28)

  if (icon && isEmoji(icon)) {
    return (
      <div
        className="flex shrink-0 items-center justify-center font-semibold text-white"
        style={{ width: size, height: size, borderRadius: radius, background: colorFor(agent.slug), fontSize: Math.round(size * 0.42) }}
      >
        {icon}
      </div>
    )
  }

  const seed = parseSeed(icon, agent.slug)
  const accent = colorFor(seed)
  const skin = agent.source === 'organization' ? '#ead8c1' : '#f1d0b4'
  const hair = agent.source === 'built-in' ? '#1c2430' : '#3b2f28'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="shrink-0 overflow-hidden"
      style={{ borderRadius: radius, background: `linear-gradient(135deg, ${accent}24, var(--surface-muted))` }}
      aria-hidden="true"
    >
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="18" fill="none" stroke="var(--border-soft)" strokeWidth="1.5" />
      <circle cx="32" cy="35" r="17" fill={skin} />
      <path d="M18 31c3-11 13-16 25-10 4 2 7 7 7 13-6-4-13-6-22-5-4 0-7 1-10 2Z" fill={hair} />
      <path d="M23 41c5 7 14 9 22 1" fill="none" stroke="#5d4336" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="26" cy="34" r="2.2" fill="#171717" />
      <circle cx="39" cy="34" r="2.2" fill="#171717" />
      <path d="M44 16h9v9M48.5 20.5l-8 8" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="20" r="3" fill={accent} />
      <path d="M13 23v8M13 27H7M13 27h6" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M21 52c5 4 16 4 22 0" fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
