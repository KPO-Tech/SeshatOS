export type StorageConfigState = {
  provider: 'local' | 's3' | 'minio' | string
  local_path?: string
  s3_endpoint?: string
  s3_bucket?: string
  s3_region?: string
  s3_key_prefix?: string
  has_s3_access_key: boolean
  has_s3_secret_key: boolean
  is_configured: boolean
  updated_at?: number
}

export type StorageStatus = {
  active_provider: string
  config: StorageConfigState
  restart_required: boolean
}

export type StorageForm = {
  provider: string
  local_path: string
  s3_endpoint: string
  s3_bucket: string
  s3_region: string
  s3_key_prefix: string
  s3_access_key: string
  s3_secret_key: string
}
