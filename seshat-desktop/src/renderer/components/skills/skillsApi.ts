import { api } from '@renderer/api/client'
import type { CatalogEntry, RepoInfo, Skill, TreeNode } from './skillsTypes'

export async function fetchSkills() {
  const result = await api.get<{ skills: Skill[] }>('/skills')
  return result.skills ?? []
}

export function setSkillEnabled(name: string, enabled: boolean) {
  return api.put(`/skills/${encodeURIComponent(name)}`, { enabled })
}

export function deleteSkill(name: string) {
  return api.delete(`/skills/${encodeURIComponent(name)}`)
}

export async function fetchSkillContent(name: string) {
  const result = await api.get<{ content: string }>(`/skills/${encodeURIComponent(name)}/content`)
  return result.content ?? ''
}

export async function fetchSkillTree(name: string) {
  const result = await api.get<{ tree: TreeNode[] }>(`/skills/${encodeURIComponent(name)}/tree`)
  return result.tree ?? []
}

export async function fetchSkillFile(name: string, path: string) {
  const result = await api.get<{ content: string }>(`/skills/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`)
  return result.content ?? ''
}

// Admin-only on the backend - callers should treat a failure as "no
// repository management available" rather than an error to surface.
export async function fetchSkillRepos() {
  const result = await api.get<{ installed: RepoInfo[]; catalog: CatalogEntry[] }>('/skills/repos')
  return { installed: result.installed ?? [], catalog: result.catalog ?? [] }
}

export function installSkillRepo(url: string) {
  return api.post('/skills/repos', { url })
}

export function uninstallSkillRepo(name: string) {
  return api.delete(`/skills/repos/${encodeURIComponent(name)}`)
}
