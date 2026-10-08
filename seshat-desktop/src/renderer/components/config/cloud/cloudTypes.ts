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
}
