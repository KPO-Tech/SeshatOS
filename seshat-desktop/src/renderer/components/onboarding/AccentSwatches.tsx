import { ACCENTS } from '@renderer/lib/accent'

/** The colours an accent can take, as round swatches; the one in use is ticked. */
export function AccentSwatches({ current, onPick, size = 36 }: { current: string; onPick: (hex: string) => void; size?: number }) {
  return (
    <div role="radiogroup" aria-label="Accent color" className="flex items-center gap-4">
      {ACCENTS.map((choice) => {
        const selected = current.toLowerCase() === choice.hex
        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={choice.label}
            title={choice.label}
            onClick={() => onPick(choice.hex)}
            className="flex cursor-pointer items-center justify-center rounded-full border-0 text-white outline-offset-2 transition-transform hover:scale-105"
            style={{ background: choice.hex, width: size, height: size }}
          >
            {selected && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
