export type CloudStatus = {
  connected: boolean
  server_url?: string
  device_id?: string
  device_name?: string
  connected_by_user_id?: string
  connected_at?: string
  policies?: Record<string, boolean>
  min_app_version?: string
  app_version_outdated?: boolean
  rules?: CloudOrganizationRules
}

// What the organization imposes on every agent on this desktop, as last received.
export type CloudOrganizationRules = {
  instructions: string
  forbidden_tools: string[]
  version?: string
}
