import { useEffect, useMemo, useState } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { AgentState } from '@renderer/stores/session'

// Present-continuous fragments for "SeshatOS is ___" - a tool-aware status
// line shown in the transcript itself while a turn is running.
const TOOL_ACTIVITY_PHRASES: Record<string, string> = {
  write: 'chat:chat.messages.liveActivity.writingFile',
  file_write: 'chat:chat.messages.liveActivity.writingFile',
  edit: 'chat:chat.messages.liveActivity.editingFile',
  file_edit: 'chat:chat.messages.liveActivity.editingFile',
  bash: 'chat:chat.messages.liveActivity.runningCommand',
  read: 'chat:chat.messages.liveActivity.readingFile',
  file_read: 'chat:chat.messages.liveActivity.readingFile',
  read_file: 'chat:chat.messages.liveActivity.readingFile',
  glob: 'chat:chat.messages.liveActivity.searchingFiles',
  grep: 'chat:chat.messages.liveActivity.searchingCode',
  list_directory: 'chat:chat.messages.liveActivity.browsingFiles',
  web_search: 'chat:chat.messages.liveActivity.searchingWeb',
  web_fetch: 'chat:chat.messages.liveActivity.fetchingPage',
  task_create: 'chat:chat.messages.liveActivity.planningTasks',
  task_update: 'chat:chat.messages.liveActivity.updatingTasks',
  submit_plan: 'chat:chat.messages.liveActivity.writingPlan',
  exit_plan_mode: 'chat:chat.messages.liveActivity.wrappingPlan',
  agent: 'chat:chat.messages.liveActivity.delegating',
  spawn_agent: 'chat:chat.messages.liveActivity.delegating',
  generate_image: 'chat:chat.messages.liveActivity.generatingImage',
  present_artifact: 'chat:chat.messages.liveActivity.preparingFile',
  tts: 'chat:chat.messages.liveActivity.generatingAudio',
  stt: 'chat:chat.messages.liveActivity.transcribingAudio',
}

// Rotated through while the agent is reasoning with no specific tool active.
const THINKING_WORDS = [
  'chat:chat.messages.liveActivity.word.thinking',
  'chat:chat.messages.liveActivity.word.reasoning',
  'chat:chat.messages.liveActivity.word.considering',
  'chat:chat.messages.liveActivity.word.synthesizing',
  'chat:chat.messages.liveActivity.word.puzzling',
  'chat:chat.messages.liveActivity.word.mulling',
  'chat:chat.messages.liveActivity.word.weighing',
  'chat:chat.messages.liveActivity.word.piecing',
  'chat:chat.messages.liveActivity.word.contemplating',
  'chat:chat.messages.liveActivity.word.turning',
  'chat:chat.messages.liveActivity.word.workingOut',
  'chat:chat.messages.liveActivity.word.sketching',
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

function agentActivityPhrase(state: AgentState, thinkingWord: string, t: TFunction): string {
  if (state.activeTool) return capitalize(t(TOOL_ACTIVITY_PHRASES[state.activeTool.toolName] ?? 'chat:chat.messages.liveActivity.working'))
  if (state.isThinking) return thinkingWord
  if (state.stage) return state.stage.label
  return capitalize(t('chat:chat.messages.liveActivity.working'))
}

export function useLiveActivityForAgent(state: AgentState): { label: string; detail?: string } {
  const { t } = useTranslation('chat')
  const isPureThinking = state.isThinking && !state.activeTool
  const words = useMemo(() => THINKING_WORDS.map((key) => t(key)), [t])
  const thinkingWord = useRotatingWord(words, isPureThinking)
  return {
    label: agentActivityPhrase(state, thinkingWord, t),
    detail: state.activeTool?.message,
  }
}
