import type { CSSProperties } from 'react'

type Props = {
  size?: number
  className?: string
  style?: CSSProperties
}

export function NexusLogo({ size = 80, className, style }: Props) {
  // Use only the orange logo for both themes.
  // A relative path (no leading "/") matters specifically for the packaged
  // Electron app: the renderer loads over file://, where a root-absolute
  // path resolves against the filesystem root, not the app directory - the
  // broken-image icon on the login screen was exactly this. A relative
  // path resolves against the loaded document (always index.html - this is
  // a client-routed SPA, react-router navigation never reloads it), which
  // is correct both in dev (served from /) and in the packaged app.
  const src = 'seshat.svg'

  return (
    <img
      src={src}
      alt="Seshat"
      width={size}
      height={size}
      className={['object-contain', className].filter(Boolean).join(' ')}
      style={style}
    />
  )
}
