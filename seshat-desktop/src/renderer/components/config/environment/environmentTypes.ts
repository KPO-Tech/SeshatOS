export type EnvVarDef = {
  key: string
  label: string
  description: string
  group: string
  groupLabel: string
  helpUrl?: string
  hidden?: boolean
}

export type EnvVarGroup = {
  id: string
  label: string
  defs: EnvVarDef[]
}
