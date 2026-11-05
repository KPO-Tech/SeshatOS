import { useEffect } from 'react'
import { notify } from '@renderer/stores/notifications'
import { useTranslation } from 'react-i18next'

/** Puts the arrival of a new version in the bell: the banner offers the restart, and this keeps a trace of it. */
export function useUpdateNotice() {
  const { t } = useTranslation('chat')
  useEffect(() => window.seshat?.updates?.onDownloaded((payload) => notify('update', { title: t('hooks.useUpdateNotice.ready', { version: payload.version }), body: t('hooks.useUpdateNotice.restart') })), [])
}
