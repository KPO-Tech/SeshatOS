import type { ComponentType } from 'react'
import { fillLive, formatNumber, optionsOf, selectOf, sliderOf, toggleOf, VAR_LIMITS } from '../../lang/vars'
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

function Toggle({ props }: ComponentProps) {
  const vars = useVars()
  const spec = toggleOf({ props })
  if (!spec) return null
  const on = (vars.values[spec.name] ?? spec.value) === 1
  const label = text(props.label) ?? spec.name
  return (
    <label className="my-1 flex cursor-pointer items-center gap-3 text-[12.5px] text-app-text-secondary">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => vars.set(spec.name, on ? 0 : 1)}
        className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border-0 transition-colors ${on ? 'bg-[var(--accent-primary)]' : 'bg-app-border'}`}
      >
        <span className={`absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
      </button>
      <span className="font-medium">{label}</span>
    </label>
  )
}

function Select({ props }: ComponentProps) {
  const vars = useVars()
  const spec = selectOf({ props })
  if (!spec) return null
  const options = optionsOf({ props })
  const value = vars.values[spec.name] ?? spec.value
  const label = text(props.label) ?? spec.name
  return (
    <label className="my-1 flex items-center gap-3 text-[12.5px] text-app-text-secondary">
      <span className="w-[30%] min-w-16 max-w-44 shrink-0 truncate font-medium">{label}</span>
      <select
        value={value}
        aria-label={label}
        onChange={(event) => vars.set(spec.name, Number(event.target.value))}
        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-app-border-subtle bg-app-surface px-2.5 py-1.5 text-[13px] text-app-text outline-none focus:border-[var(--accent-primary)]"
      >
        {options.map((option, index) => (
          <option key={index} value={index}>
            {option}
          </option>
        ))}
      </select>
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

export const varsComponents: Record<string, ComponentType<ComponentProps>> = { Slider, Toggle, Select, Live }
