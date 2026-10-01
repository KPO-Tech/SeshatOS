import { useEffect, useState } from 'react'
import type { AgentState } from '@renderer/stores/session'

// Present-continuous fragments for "SeshatOS is ___" - a tool-aware status
// line shown in the transcript itself while a turn is running.
const TOOL_ACTIVITY_PHRASES: Record<string, string> = {
  write: 'writing a file', file_write: 'writing a file',
  edit: 'editing a file', file_edit: 'editing a file',
  bash: 'running a command',
  read: 'reading a file', file_read: 'reading a file', read_file: 'reading a file',
  glob: 'searching files', grep: 'searching code', list_directory: 'browsing files',
  web_search: 'searching the web', web_fetch: 'fetching a page',
  task_create: 'planning tasks', task_update: 'updating tasks',
  submit_plan: 'writing the plan', exit_plan_mode: 'wrapping up the plan',
  agent: 'delegating to a sub-agent', spawn_agent: 'delegating to a sub-agent',
  generate_image: 'generating an image', tts: 'generating audio', stt: 'transcribing audio',
}

// Rotated through while the agent is reasoning with no specific tool active.
const THINKING_WORDS = [
  'Thinking', 'Reasoning', 'Considering', 'Synthesizing', 'Puzzling it out',
  'Mulling it over', 'Weighing options', 'Piecing it together', 'Contemplating',
  'Turning it over', 'Working it out', 'Sketching a plan',
]

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function useRotatingWord(words: string[], active: boolean, intervalMs = 1900): string {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs)
    return () => clearInterval(id)
  }, [active, words, intervalMs])
  return words[index] ?? words[0]
}

function agentActivityPhrase(state: AgentState, thinkingWord: string): string {
  if (state.activeTool) return capitalize(TOOL_ACTIVITY_PHRASES[state.activeTool.toolName] ?? 'working')
  if (state.isThinking) return thinkingWord
  if (state.stage) return state.stage.label
  return 'Working'
}

export function useLiveActivityForAgent(state: AgentState): { label: string; detail?: string } {
  const isPureThinking = state.isThinking && !state.activeTool
  const thinkingWord = useRotatingWord(THINKING_WORDS, isPureThinking)
  return {
    label: agentActivityPhrase(state, thinkingWord),
    detail: state.activeTool?.message,
  }
}
