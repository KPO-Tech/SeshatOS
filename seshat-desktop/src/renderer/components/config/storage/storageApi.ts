import { api } from '@renderer/api/client'
import type { StorageForm, StorageStatus } from './storageTypes'

export function fetchStorageStatus() {
  return api.get<StorageStatus>('/settings/storage')
}

export function saveStorageConfig(form: StorageForm) {
  return api.put<StorageStatus>('/settings/storage', {
    provider: form.provider,
    local_path: form.local_path,
    s3_endpoint: form.s3_endpoint,
    s3_bucket: form.s3_bucket,
    s3_region: form.s3_region,
    s3_key_prefix: form.s3_key_prefix,
    s3_access_key: form.s3_access_key.trim() ? form.s3_access_key : undefined,
    s3_secret_key: form.s3_secret_key.trim() ? form.s3_secret_key : undefined
  })
}
