import { getSecret, setSecret, deleteSecret } from './ipc/secure-store'

// The optional credential-shaped env vars seshat-backend reads via os.Getenv
// at startup (see internal/inbox/gmail/oauth.go, internal/config/bootstrap.go)
// to conditionally wire up a feature - each one gates a specific integration
// rather than being required for the app to run at all. This list is
// deliberately scoped to *credentials* a local user would paste in here;
// infra knobs the backend also reads from the environment (SESHAT_API_PORT,
// SESHAT_VECTOR_DIM, ...) don't belong in a
// "your API keys" UI and aren't listed.
export type EnvVarGroup = 'gmail' | 'automation' | 'multimodal'

export type EnvVarDef = {
  key: string
  label: string
  description: string
  group: EnvVarGroup
  groupLabel: string
  helpUrl?: string
  // Multimodal's two entries are managed from their own "Custom" mode in
  // Settings > Multimodal (image generation / speech) instead of the
  // generic Environment list, now that AI Providers auto-links a
  // compatible provider's key here first - see CapabilitiesViews.tsx.
  // Still real ENV_VAR_CATALOG entries (same secure-storage/IPC plumbing,
  // still injected into the backend sidecar's env) so there's one
  // mechanism, not two - just not rendered a second time on the
  // Environment page.
  hidden?: boolean
}

export const ENV_VAR_CATALOG: EnvVarDef[] = [
  {
    key: 'GOOGLE_OAUTH_CLIENT_ID',
    label: 'Client ID',
    description: 'From a Google Cloud OAuth client (type: Desktop app) with the Gmail API enabled.',
    group: 'gmail',
    groupLabel: 'Gmail',
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    key: 'GOOGLE_OAUTH_CLIENT_SECRET',
    label: 'Client Secret',
    description: 'Paired with the Client ID above, from the same OAuth client.',
    group: 'gmail',
    groupLabel: 'Gmail',
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    key: 'AUTOMATION_API_KEY',
    label: 'Automation Service API Key',
    description: 'Auth key for the external automation service used by recurring/scheduled agent runs.',
    group: 'automation',
    groupLabel: 'Automation',
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    description: 'Standalone key for image generation and speech, when not reusing a chat provider - see Settings > Multimodal.',
    group: 'multimodal',
    groupLabel: 'Multimodal',
    helpUrl: 'https://platform.openai.com/api-keys',
    hidden: true,
  },
  {
    key: 'GOOGLE_API_KEY',
    label: 'Gemini API Key',
    description: 'Standalone key for image generation, when not reusing a chat provider - see Settings > Multimodal.',
    group: 'multimodal',
    groupLabel: 'Multimodal',
    helpUrl: 'https://aistudio.google.com/apikey',
    hidden: true,
  },
]

const STORE_PREFIX = 'env:'

function assertKnownKey(key: string): void {
  if (!ENV_VAR_CATALOG.some((def) => def.key === key)) {
    throw new Error(`Unknown environment variable: ${key}`)
  }
}

export async function listEnvVarStatus(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {}
  for (const def of ENV_VAR_CATALOG) {
    status[def.key] = (await getSecret(STORE_PREFIX + def.key)) != null
  }
  return status
}

export async function setEnvVar(key: string, value: string): Promise<void> {
  assertKnownKey(key)
  const trimmed = value.trim()
  if (!trimmed) {
    await deleteSecret(STORE_PREFIX + key)
    return
  }
  await setSecret(STORE_PREFIX + key, trimmed)
}

export async function deleteEnvVar(key: string): Promise<void> {
  assertKnownKey(key)
  await deleteSecret(STORE_PREFIX + key)
}

/**
 * Reads every configured value back out and returns them as a plain env
 * object, for merging into the backend sidecar's spawn environment
 * (see backend-process.ts). Only called from the main process, never
 * exposed to the renderer - the renderer only ever sees per-key booleans
 * (listEnvVarStatus), never the decrypted values themselves.
 */
export async function resolveEnvVarOverrides(): Promise<Record<string, string>> {
  const overrides: Record<string, string> = {}
  for (const def of ENV_VAR_CATALOG) {
    const value = await getSecret(STORE_PREFIX + def.key)
    if (value) overrides[def.key] = value
  }
  return overrides
}
