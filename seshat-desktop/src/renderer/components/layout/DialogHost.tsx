import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useDialogsStore } from '@renderer/stores/dialogs'

// Takes the person to the page of Settings that something asked for (see stores/dialogs), and remembers the page they leave, for the way back.
export function DialogHost() {
  const target = useDialogsStore((state) => state.target)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!target) return
    const inSettings = location.pathname.startsWith('/settings')
    const from = inSettings ? (location.state as { from?: string } | null)?.from : `${location.pathname}${location.search}`
    navigate(`/settings/${target}`, { replace: inSettings, state: { from } })
    useDialogsStore.setState({ target: null })
  }, [target, location, navigate])

  return null
}
