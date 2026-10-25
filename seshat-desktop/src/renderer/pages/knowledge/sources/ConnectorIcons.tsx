import type { ConnectorKind } from './connectorTypes'

export function ConnectorIcon({ kind, size = 36 }: { kind: ConnectorKind; size?: number }) {
  if (kind === 'gdrive') return <GoogleDriveIcon size={size} />
  if (kind === 'sharepoint') return <SharePointIcon size={size} />
  if (kind === 's3') return <S3Icon size={size} />
  return <ActionIcon size={size} />
}

function GoogleDriveIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#F7F7F2" />
      <path d="M14.2 7h7.6l8.2 14.2h-7.6L14.2 7Z" fill="#34A853" />
      <path d="M6 21.2 14.2 7l3.8 6.6-4.4 7.6H6Z" fill="#188038" />
      <path d="M10.4 29 6 21.2h16.4l4.4 7.8H10.4Z" fill="#4285F4" />
      <path d="M26.8 29 30 21.2h-7.6L18 29h8.8Z" fill="#1967D2" />
      <path d="M18 13.6 21.8 7l8.2 14.2h-7.6L18 13.6Z" fill="#FBBC04" />
    </svg>
  )
}

function SharePointIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#036C70" />
      <circle cx="21" cy="13" r="5" fill="#37C6D0" />
      <circle cx="24" cy="22" r="6" fill="#1A9BA1" />
      <rect x="7" y="10" width="14" height="16" rx="3" fill="#0A5D61" />
      <path d="M12 20.2c.7.6 1.6.9 2.6.9 1.2 0 2-.5 2-1.3 0-.7-.4-1.1-1.6-1.5l-1.2-.4c-1.6-.5-2.5-1.4-2.5-2.8 0-1.7 1.5-2.9 3.6-2.9 1.2 0 2.3.3 3.1.9l-.8 1.5a4 4 0 0 0-2.3-.7c-1 0-1.6.4-1.6 1.1 0 .6.5 1 1.6 1.4l1.2.4c1.7.5 2.5 1.4 2.5 2.9 0 1.8-1.4 3-3.9 3-1.4 0-2.7-.4-3.5-1.1l.8-1.4Z" fill="white" />
    </svg>
  )
}

function S3Icon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#232F3E" />
      <path d="M18 6 8 11.5v13L18 30l10-5.5v-13L18 6Z" stroke="#FF9900" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 11.5 18 17l10-5.5M18 17v13" stroke="#FF9900" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 21.5h10" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ActionIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <rect width="36" height="36" rx="9" fill="#6D4AFF" />
      <path d="M11 23.5 24 10.5M18 10h6v6M12 13.5h-1.5A2.5 2.5 0 0 0 8 16v9.5a2.5 2.5 0 0 0 2.5 2.5H20a2.5 2.5 0 0 0 2.5-2.5V24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
