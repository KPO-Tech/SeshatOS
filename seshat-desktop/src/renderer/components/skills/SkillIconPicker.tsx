import { useEffect } from 'react'
import { SkillIconTile } from './SkillIconTile'
import { SKILL_ICON_IDS, type SkillIconId } from './skillIcons'

type Props = {
  skillName: string
  current: SkillIconId
  /** True when the person chose the current one. */
  chosen: boolean
  onPick: (icon: SkillIconId | null) => void
  onClose: () => void
}

/** The icons a skill may take. "Automatic" gives it back the one its topic suggests. */
export function SkillIconPicker({ skillName, current, chosen, onPick, onClose }: Props) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-[rgba(0,0,0,0.45)] px-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Choose an icon" className="w-full max-w-[420px] rounded-2xl border border-app-border-subtle bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-medium)]">
        <h2 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">Icon for {skillName}</h2>
        <div className="mt-4 grid grid-cols-6 gap-2">
          {SKILL_ICON_IDS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              aria-pressed={chosen && current === icon}
              onClick={() => {
                onPick(icon)
                onClose()
              }}
              className={`flex cursor-pointer items-center justify-center rounded-xl border bg-transparent p-1.5 hover:bg-[var(--surface-hover)] ${chosen && current === icon ? 'border-[var(--accent-primary)]' : 'border-transparent'}`}
            >
              <SkillIconTile icon={icon} size={40} />
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            disabled={!chosen}
            onClick={() => {
              onPick(null)
              onClose()
            }}
            className="cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-40"
          >
            Automatic
          </button>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg border border-[var(--border-soft)] bg-transparent px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
