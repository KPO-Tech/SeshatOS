import type { CSSProperties } from 'react'

type Props = {
  size?: number
  className?: string
  style?: CSSProperties
}

export function SeshatLogo({ size = 80, className, style }: Props) {
  // Relative path on purpose: in the packaged app the renderer loads over
  // file://, where a root-absolute path resolves against the filesystem root.
  return (
    <img
      src="seshat.svg"
      alt="Seshat"
      width={size}
      height={size}
      className={['object-contain', className].filter(Boolean).join(' ')}
      style={style}
    />
  )
}
