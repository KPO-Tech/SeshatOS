import { Close, Minus, Square } from '@icon-park/react'

export function WindowMinimizeIcon({ size = 11 }: { size?: number }) {
  return <Minus size={size} />
}

export function WindowMaximizeIcon({ size = 10 }: { size?: number }) {
  return <Square size={size} />
}

export function WindowCloseIcon({ size = 11 }: { size?: number }) {
  return <Close size={size} />
}
