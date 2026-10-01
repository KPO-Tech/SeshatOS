export type AutomationStatus = {
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

export type AutomationRunNode = {
  id: string
  type: string
  success: boolean
  skipped?: boolean
  error?: string
  output?: Record<string, unknown>[]
  duration_ms?: number
}

export type AutomationRun = {
  id: string
  job_id: string
  job_name?: string
  status: string
  queued_at?: string
  started_at?: string
  finished_at?: string
  output_text?: string
  error_text?: string
  // Workflow (graph) runs only: one entry per executed node.
  node_trace?: AutomationRunNode[]
}

export type WebhookMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
export type WebhookResponseMode = 'immediate' | 'whenFinished'

export type AutomationJob = {
  id: string
  name: string
  description?: string
  status: string
  trigger_type: string
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  next_run_at?: string
  last_run_at?: string
  last_run_status?: string
  execution_target?: string
  target_device_id?: string
  // Prompt-only jobs (Scheduling) set `prompt` and omit `graph`; workflow
  // jobs (Automation) do the reverse - the two are mutually exclusive on
  // one shared backend job record (see seshat-server's normalizeJobTrigger).
  prompt?: string
  graph?: unknown
  model_override?: string
  configuration?: Record<string, string>
  // Set by the server once a webhook trigger has been saved; a saved webhook
  // job comes back with an empty trigger_type, so the token is the real signal.
  webhook_token?: string
  webhook_method?: WebhookMethod
  webhook_response_mode?: WebhookResponseMode
}

// What the create/update endpoints accept - a job to create/replace, not
// the richer record the server hands back (no id/next_run_at/etc.).
export type AutomationJobParams = {
  name: string
  description?: string
  trigger_type: string
  cron_expr?: string
  interval_seconds?: number
  run_at?: string
  execution_target?: string
  target_device_id?: string
  prompt?: string
  model_override?: string
  configuration?: Record<string, string>
  webhook_method?: WebhookMethod
  webhook_response_mode?: WebhookResponseMode
}

export type AutomationOverview = {
  stats?: {
    active_projects?: number
    total_projects?: number
    executions_window?: number
    completed_window?: number
    failed_window?: number
    success_rate_percent?: number
  }
  attention?: Array<{ kind: string; job_id: string; job_name: string; message: string; detected_at: string }>
  recent_activity?: Array<{ run_id: string; job_id: string; job_name: string; status: string; queued_at: string }>
}
