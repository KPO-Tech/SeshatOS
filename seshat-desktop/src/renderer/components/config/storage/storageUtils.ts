import type { StorageForm, StorageStatus } from './storageTypes'

export function storageFormFromStatus(status: StorageStatus | null): StorageForm {
  const config = status?.config
  return {
    provider: config?.provider ?? 'local',
    local_path: config?.local_path ?? '',
    s3_endpoint: config?.s3_endpoint ?? '',
    s3_bucket: config?.s3_bucket ?? '',
    s3_region: config?.s3_region ?? 'us-east-1',
    s3_key_prefix: config?.s3_key_prefix ?? '',
    s3_access_key: '',
    s3_secret_key: ''
  }
}
