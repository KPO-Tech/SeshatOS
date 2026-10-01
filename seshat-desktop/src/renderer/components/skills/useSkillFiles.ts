import { useEffect, useState } from 'react'
import { fetchSkillContent, fetchSkillFile, fetchSkillTree } from './skillsApi'
import type { TreeNode } from './skillsTypes'

export const MAIN_FILE = /^skill\.md$/i

// Loads a skill's file tree and the content of the selected file.
//
// The main SKILL.md goes through the file endpoint, not /content: /content only
// resolves skills in the user's own directory, so repo-installed skills would
// come back "not found". /content stays as the fallback when the tree itself
// can't be fetched.
export function useSkillFiles(skillName: string) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [treeFailed, setTreeFailed] = useState(false)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchSkillTree(skillName)
      .then((nodes) => {
        if (cancelled) return
        setTree(nodes)
        const mainFile = nodes.find((node) => !node.is_dir && MAIN_FILE.test(node.name)) ?? nodes.find((node) => !node.is_dir)
        setSelected(mainFile?.path ?? 'SKILL.md')
      })
      .catch(() => {
        if (cancelled) return
        setTree([])
        setTreeFailed(true)
        setSelected('SKILL.md')
      })
    return () => { cancelled = true }
  }, [skillName])

  useEffect(() => {
    if (selected === null) return
    let cancelled = false
    setLoading(true)
    const load = treeFailed ? fetchSkillContent(skillName) : fetchSkillFile(skillName, selected)
    load
      .then((text) => { if (!cancelled) setContent(text) })
      .catch((err) => { if (!cancelled) setContent(err instanceof Error ? `Could not load this file: ${err.message}` : 'Could not load this file.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [skillName, selected, treeFailed])

  return { tree, selected, setSelected, content, loading }
}
