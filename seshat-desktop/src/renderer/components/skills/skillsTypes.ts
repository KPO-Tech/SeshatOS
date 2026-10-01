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
