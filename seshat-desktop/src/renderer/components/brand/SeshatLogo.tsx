import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  size?: number
  className?: string
  style?: CSSProperties
}

// One image per theme, switched in CSS (see .brand-mark-on-* in base.css), so
// the logo follows the theme without a re-render. Relative paths on purpose:
// the packaged app loads over file://, where a root-absolute path resolves
// against the filesystem root.
export function SeshatLogo({ size = 80, className, style }: Props) {
  const { t } = useTranslation('shell')
  const classes = ['object-contain', className].filter(Boolean).join(' ')

  return (
    <>
      <img
        src="brand/mark-on-light.svg"
        alt={t('brand.seshatLogo.seshatos')}
        width={size}
        height={size}
        className={`brand-mark-on-light ${classes}`}
        style={style}
      />
      <img
        src="brand/mark-on-dark.svg"
        alt={t('brand.seshatLogo.seshatos')}
        width={size}
        height={size}
        className={`brand-mark-on-dark ${classes}`}
        style={style}
      />
    </>
  )
}
