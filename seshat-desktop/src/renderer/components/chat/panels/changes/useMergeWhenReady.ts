import { useEffect, useMemo } from 'react'
import { mergeRequestMessage, pullStatus, type PullRequest } from '@renderer/lib/pullRequests'
import { useArmedPulls, usePullMergeStore } from '@renderer/stores/pullMerge'
import { usePullRequests } from './usePullRequests'

/**
 * Asks the agent of an open conversation to merge each pull request the person set to "merge when ready", once GitHub says it is: the
 * consent was given on the pull request, the merge itself is still the agent's, under its usual permissions. It waits for a running turn
 * to end, sends one request at a time, and forgets a pull request once asked, merged or closed, so nothing is ever asked twice. It only
 * watches while the conversation is open: sending into a conversation that is not loaded would leave its messages out of step.
 */
export function useMergeWhenReady(sessionId: string, sendMessage: (text: string) => Promise<void> | void, isStreaming: boolean) {
  const armed = useArmedPulls(sessionId)
  const disarm = usePullMergeStore((s) => s.disarm)
  // An armed pull request was already shown as the agent's: it is asked about without a window.
  const candidates = useMemo(() => armed.map((url) => ({ url })), [armed])
  const { result } = usePullRequests(candidates)

  useEffect(() => {
    if (!sessionId || !result || isStreaming) return
    const { forget, ask } = nextMerge(result.pulls, armed)
    for (const url of forget) disarm(sessionId, url)
    if (ask) void sendMessage(mergeRequestMessage(ask))
  }, [armed, disarm, isStreaming, result, sendMessage, sessionId])
}

/**
 * What to do with the armed pull requests GitHub just described: forget the merged and closed ones, and ask for the first ready one (it
 * is forgotten too, so it is asked once). Pull requests that are not armed are never touched.
 */
export function nextMerge(pulls: readonly PullRequest[], armed: readonly string[]): { forget: string[]; ask: PullRequest | null } {
  const watched = pulls.filter((pull) => armed.includes(pull.url))
  const forget = watched.filter((pull) => pull.state === 'merged' || pull.state === 'closed').map((pull) => pull.url)
  const ask = watched.find((pull) => pullStatus(pull) === 'ready') ?? null
  if (ask) forget.push(ask.url)
  return { forget, ask }
}
