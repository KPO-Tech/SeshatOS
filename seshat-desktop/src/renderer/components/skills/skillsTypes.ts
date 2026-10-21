export type Skill = {
  name: string
  display_name: string
  description: string
  source: string
  collection: string
  version?: string
  argument_hint?: string
  when_to_use?: string
  is_hidden: boolean
  user_invocable: boolean
  enabled: boolean
}

export type TreeNode = {
  name: string
  path: string
  is_dir: boolean
  children?: TreeNode[]
}

export type RepoInfo = {
  name: string
  url?: string
  skill_count: number
}

export type CatalogEntry = {
  name: string
  url: string
  description: string
  installed: boolean
  source?: 'organization'
}

/** A tool whose skill folder the agent may use in place (Claude Code, Codex). */
export type SkillSourceTool = {
  id: 'claude_code' | 'codex'
  label: string
  path: string
  detected: boolean
  skill_count: number
  enabled: boolean
}

export type SkillSourceFolder = {
  path: string
  exists: boolean
  skill_count: number
}

export type SkillSources = {
  tools: SkillSourceTool[]
  folders: SkillSourceFolder[]
}

export type SkillSourcesChoice = {
  claude_code: boolean
  codex: boolean
  folders: string[]
}
