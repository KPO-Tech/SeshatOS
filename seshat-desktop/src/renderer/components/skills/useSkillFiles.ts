import { useCallback, useEffect, useMemo, useState } from 'react'
import { treeFileSource } from '@renderer/components/files/fileSource'
import { fetchSkillContent, fetchSkillFile, fetchSkillTree } from './skillsApi'
import type { TreeNode } from './skillsTypes'

export const MAIN_FILE = /^skill\.md$/i

// Loads a skill's file tree, and gives the way to read one of its files.
//
// The main SKILL.md goes through the file endpoint, not /content: /content only
// resolves skills in the user's own directory, so repo-installed skills would
// come back "not found". /content stays as the fallback when the tree itself
// can't be fetched.
export function useSkillFiles(skillName: string) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [treeFailed, setTreeFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [skillName])

  // The files of the skill, as the shared tree of files reads them.
  const source = useMemo(() => treeFileSource(tree, skillName), [tree, skillName])
  const readText = useCallback((path: string) => (treeFailed ? fetchSkillContent(skillName) : fetchSkillFile(skillName, path)), [skillName, treeFailed])

  return { tree, source, selected, setSelected, loading, readText }
}
