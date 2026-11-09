import { useEffect, useRef, useState } from 'react'
import { CheckOne, Copy } from '@icon-park/react'

const CONFIRMATION_MS = 1500

type Props = {
  text: string
  label: string
  className: string
  size?: number
  /** The button sits inside a row that opens or closes on click: the click must stop here. */
  stopPropagation?: boolean
  /** Shown as a tooltip too, for buttons that have no other text. */
  withTitle?: boolean
}

/** An icon button that copies a text and shows a check for a moment, so the person knows it worked. */
export function CopyButton({ text, label, className, size = 10, stopPropagation = false, withTitle = false }: Props) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  function copy(event: React.MouseEvent) {
    if (stopPropagation) event.stopPropagation()
    // The check only appears when the text really reached the clipboard.
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), CONFIRMATION_MS)
    }, () => undefined)
  }

  return (
    <button type="button" className={className} aria-label={label} title={withTitle ? label : undefined} onClick={copy}>
      {copied ? <span className="inline-flex text-app-success"><CheckOne size={size} /></span> : <Copy size={size} />}
    </button>
  )
}
