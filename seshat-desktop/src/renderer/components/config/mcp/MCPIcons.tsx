export function MCPServerIcon({ icon, type, size = 36 }: { icon?: string; type?: string; size?: number }) {
  if (icon) {
    return (
      <span className="flex items-center justify-center text-[18px]" style={{ width: size, height: size }}>
        {icon}
      </span>
    )
  }

  const network = type !== 'stdio'
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill={network ? '#2563EB' : '#2F6B4F'} />
      {network ? (
        <>
          <circle cx="18" cy="18" r="9" stroke="white" strokeWidth="2" />
          <path d="M9 18h18M18 9c2.4 2.7 3.6 5.7 3.6 9S20.4 24.3 18 27c-2.4-2.7-3.6-5.7-3.6-9S15.6 11.7 18 9Z" stroke="white" strokeWidth="2" />
        </>
      ) : (
        <>
          <path d="m11 13 5 5-5 5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M19 23h7" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
