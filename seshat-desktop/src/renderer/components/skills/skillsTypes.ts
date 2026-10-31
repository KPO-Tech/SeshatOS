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

/** What installing a repository will put on the machine, as the backend read it before anything is installed. */
export type InstallPlan = {
  python?: { minimum: string; found: boolean; version?: string; files?: string[]; packages: string[] }
  node?: { found: boolean; version?: string; packages: string[] }
  warnings?: string[]
}

export type InstallResult = {
  name: string
  skill_count: number
  plan: InstallPlan
  /** True when the skills wait for the person to agree to the plan. */
  needs_environment: boolean
}

export type CatalogEntry = {
  name: string
  url: string
  description: string
  installed: boolean
  /** What the skills are for, as the catalog says it ('Presentations', 'Security'). */
  category?: string
  skill_count?: number
  /** What the skills use besides the agent ('Python 3.10+', 'Docker'). */
  needs?: string[]
  source?: 'organization'
}

/** A tool whose skill folder the agent may use in place (Claude Code, Codex). */
export type SkillSourceTool = {
  id: 'claude_code' | 'codex'
  label: string
  path: string
  detected: boolean
  skill_count: number
  selected: number
}

export type SkillSourceFolder = {
  path: string
  exists: boolean
  skill_count: number
  selected: number
}

export type SkillSources = {
  tools: SkillSourceTool[]
  folders: SkillSourceFolder[]
}

/** The folders (when given) and, by source, the skills validated from it. A source listed with no names stops being used. */
export type SkillSourcesChoice = {
  folders?: string[]
  selection?: Record<string, string[]>
}

export type ScanSkill = {
  name: string
  title: string
  description: string
  selected: boolean
  flag?: string
}

export type ScanResult = {
  source: string
  skills: ScanSkill[]
}
