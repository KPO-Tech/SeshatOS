import { useEffect } from 'react'
import { notify } from '@renderer/stores/notifications'

/** Puts the arrival of a new version in the bell: the banner offers the restart, and this keeps a trace of it. */
export function useUpdateNotice() {
  useEffect(() => window.seshat?.updates?.onDownloaded((payload) => notify('update', { title: `SeshatOS ${payload.version} is ready`, body: 'Restart the app to install it.' })), [])
}
