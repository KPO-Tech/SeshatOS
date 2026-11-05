import type { ComponentType } from 'react'
import { fillLive, formatNumber, sliderOf, VAR_LIMITS } from '../../lang/vars'
import type { ComponentProps } from '../NodeView'
import { text } from '../charts/readers'
import { MarkdownText } from '../text/MarkdownText'
import { useVars } from '../vars/VarsContext'

// The sliders of a block and the text that shows their numbers (ADR 0014). A slider only changes a number kept in the block: formulas read it,
// nothing is sent and nothing runs.

function Slider({ props }: ComponentProps) {
  const vars = useVars()
  const spec = sliderOf({ props })
  if (!spec) return null
  const value = vars.values[spec.name] ?? spec.value
  const label = text(props.label) ?? spec.name
  const fraction = ((value - spec.min) / (spec.max - spec.min)) * 100
  return (
    <label className="my-1 flex items-center gap-3 text-[12.5px] text-app-text-secondary">
      <span className="w-[30%] min-w-16 max-w-44 shrink-0 truncate font-medium">{label}</span>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) vars.set(spec.name, next)
        }}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full accent-[var(--accent-primary)]"
        style={{ background: `linear-gradient(to right, var(--accent-primary) ${fraction}%, var(--app-border, #3a3a3a) ${fraction}%)` }}
      />
      <span className="w-14 shrink-0 text-right tabular-nums text-app-text">{formatNumber(value)}</span>
    </label>
  )
}

function Live({ props }: ComponentProps) {
  const vars = useVars()
  const source = text(props.text)
  if (source === undefined) return null
  const shown = fillLive(source.slice(0, VAR_LIMITS.live), vars.values)
  return <MarkdownText text={shown} className="my-1 text-app-text" />
}

export const varsComponents: Record<string, ComponentType<ComponentProps>> = { Slider, Live }
