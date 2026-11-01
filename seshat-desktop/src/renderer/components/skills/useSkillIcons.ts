import { useCallback, useState } from 'react'
import { iconFor, SKILL_ICON_IDS, type SkillIconId } from './skillIcons'

const KEY = 'seshat.skillIcons.v1'

function read(): Record<string, string> {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** The icons the person chose for skills (by skill name). A skill with none takes the one its topic gives. */
export function useSkillIcons() {
  const [chosen, setChosen] = useState<Record<string, string>>(read)

  const choose = useCallback((name: string, icon: SkillIconId | null) => {
    setChosen((current) => {
      const next = { ...current }
      if (icon && (SKILL_ICON_IDS as readonly string[]).includes(icon)) next[name] = icon
      else delete next[name]
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // A browser that keeps nothing: the choice lasts until the page is closed.
      }
      return next
    })
  }, [])

  const iconOf = useCallback((skill: { name: string; display_name?: string; description?: string }) => iconFor(skill, chosen[skill.name]), [chosen])

  return { iconOf, isChosen: (name: string) => name in chosen, choose }
}
