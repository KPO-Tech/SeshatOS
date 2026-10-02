import { useEffect, useMemo, useState } from 'react'
import type { ToolUseBlock } from '@renderer/api/types'
import { useUIStore } from '@renderer/stores/ui'
import { resolveAskUserQuestions } from '../tools/helpers'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type Props = {
  tool: ToolUseBlock
  onSubmitPrompt: (promptId: string, value: unknown) => void
}

// Docked above the message box while ask_user_question has a live prompt
// pending (see Conversation.tsx's pendingAskUser) - one question at a time
// with Previous/Next, instead of every question dumped into the chat
// transcript at once. The inline tool-block rendering (AskUserToolView)
// steps aside to a small placeholder for the same tool call while this is
// showing, and takes back over with the permanent Q&A summary once answered.
//
// The backend resolves one question at a time (a fresh tool._prompt per
// question, matched by its .message) - only the question matching the
// current prompt is actually answerable. Navigating to an earlier question
// is a local, read-only review of what was already sent (tracked in the UI
// store's askUserAnswers, not local state - this component unmounts between
// each question, the moment pendingAskUser goes briefly null after a
// submission, so local state wouldn't survive to be reviewed); navigating
// past the live question isn't possible until it's answered.
export function AskUserPanel({ tool, onSubmitPrompt }: Props) {
  const prompt = tool._prompt
  const questions = useMemo(() => resolveAskUserQuestions(tool.input, prompt), [prompt, tool.input])
  const activeIndex = useMemo(() => {
    if (!prompt) return 0
    const idx = questions.findIndex((q) => q.question === prompt.message)
    return idx >= 0 ? idx : 0
  }, [prompt, questions])

  const [viewIndex, setViewIndex] = useState(activeIndex)
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [customAnswer, setCustomAnswer] = useState('')
  const askUserAnswers = useUIStore((s) => s.askUserAnswers)
  const setAskUserAnswer = useUIStore((s) => s.setAskUserAnswer)

  // A fresh prompt (next question, or this one re-issued) - jump the view
  // back to whatever the backend is actually waiting on and clear the
  // in-progress answer, even if the user was reviewing an earlier one.
  useEffect(() => {
    setViewIndex(activeIndex)
    setSelectedValues([])
    setCustomAnswer('')
  }, [prompt?.promptId, activeIndex])

  if (!prompt || questions.length === 0) return null

  const question = questions[viewIndex]
  const isActive = viewIndex === activeIndex
  const isLast = viewIndex === questions.length - 1
  const pastAnswer = !isActive ? askUserAnswers[`${tool.id}:${viewIndex}`] : undefined

  function toggleValue(value: string) {
    setCustomAnswer('')
    if (!question.multiSelect) {
      setSelectedValues([value])
      return
    }
    setSelectedValues((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    )
  }

  function goPrev() {
    setViewIndex((i) => Math.max(0, i - 1))
  }

  function goNext() {
    if (!prompt) return
    if (!isActive) {
      // Just reviewing an already-answered question - move forward locally,
      // that answer was already sent to the agent.
      setViewIndex((i) => Math.min(questions.length - 1, i + 1))
      return
    }
    const trimmedCustom = customAnswer.trim()
    let value: unknown
    let summary: string
    if (trimmedCustom) {
      value = trimmedCustom
      summary = trimmedCustom
    } else if (question.kind === 'confirm') {
      // Synthesized from a bare confirm-type prompt (see
      // resolveAskUserQuestions) - the prompt expects a boolean back, not
      // the literal "Yes"/"No" label text.
      if (!selectedValues[0]) return
      value = selectedValues[0] === 'Yes'
      summary = selectedValues[0]
    } else if (question.multiSelect) {
      if (selectedValues.length === 0) return
      value = selectedValues
      summary = selectedValues.join(', ')
    } else {
      if (!selectedValues[0]) return
      value = selectedValues[0]
      summary = selectedValues[0]
    }
    setAskUserAnswer(`${tool.id}:${viewIndex}`, summary)
    onSubmitPrompt(prompt.promptId, value)
  }

  const canSubmit = !isActive || Boolean(customAnswer.trim()) || selectedValues.length > 0
  const hasCustomAnswer = Boolean(customAnswer.trim())

  return (
    <div className="mx-auto mb-2.5 flex w-[min(780px,calc(100%-32px))] shrink-0 flex-col overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--accent-primary)_26%,var(--border-soft))] bg-[color-mix(in_srgb,var(--surface-muted)_62%,var(--surface-root))] shadow-[0_14px_34px_rgba(31,27,23,0.07)]">
      <div className="flex min-h-12 items-center justify-between gap-3.5 border-b border-app-border-subtle px-3 py-[9px] max-[760px]:flex-col max-[760px]:items-start">
        <div className="inline-flex min-w-0 items-center gap-2 text-[13px] font-bold text-app-text">
          <span className="inline-flex size-6 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--accent-primary)_22%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_10%,var(--surface-root))] text-[14px] font-[750] text-[var(--accent-primary)]">?</span>
          <span>Ask User</span>
        </div>
        {questions.length > 1 && (
          <div className="ml-auto flex items-center justify-end max-[760px]:w-full max-[760px]:justify-start">
            {questions.map((q, i) => {
              const isCurrent = i === viewIndex
              const isDone = i < activeIndex
              return (
                <span
                  key={i}
                  className={cx(
                    'relative inline-flex max-w-[120px] items-center gap-1 truncate py-0.5 pl-[18px] pr-2 text-[10px] font-[650] [&+&]:border-l [&+&]:border-app-border-subtle',
                    "before:absolute before:left-1 before:size-2 before:rounded-full before:border before:content-['']",
                    isCurrent
                      ? 'text-[var(--accent-primary)] before:border-app-primary before:bg-app-primary'
                      : isDone
                        ? 'text-app-success before:border-[color-mix(in_srgb,var(--accent-success)_45%,var(--border-strong))] before:bg-[color-mix(in_srgb,var(--accent-success)_18%,var(--surface-root))]'
                        : 'text-app-text-muted before:border-[var(--border-strong)] before:bg-app-bg',
                  )}
                  title={q.header || q.question}
                >
                  {q.header || `Q${i + 1}`}
                </span>
              )
            })}
          </div>
        )}
        {questions.length > 1 && (
          <div className="whitespace-nowrap text-[9px] uppercase tracking-[0.04em] text-app-text-muted">Question {viewIndex + 1} of {questions.length}</div>
        )}
      </div>

      <div className="flex flex-col gap-[9px] p-3">
        <div className="text-[13px] font-[650] leading-[1.4] text-app-text">{question.question}</div>

        {pastAnswer !== undefined ? (
          <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-2 rounded-[5px] bg-[color-mix(in_srgb,var(--accent-success)_8%,var(--surface-root))] px-2 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.05em] text-app-success">Your answer</span>
            <span className="min-w-0 truncate text-[11px] text-app-text">{pastAnswer}</span>
          </div>
        ) : (
          <>
            {question.options.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {question.options.map((option) => {
                  const selected = selectedValues.includes(option.label)
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className={cx(
                        'grid min-h-[42px] w-full grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 rounded-[7px] border px-2.5 py-2 text-left transition-[border-color,background,box-shadow] duration-[120ms] max-[760px]:items-start',
                        selected
                          ? 'border-[color-mix(in_srgb,var(--accent-primary)_34%,var(--border-soft))] bg-[color-mix(in_srgb,var(--accent-primary)_8%,var(--surface-root))]'
                          : 'border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_92%,var(--surface-panel))] hover:border-[color-mix(in_srgb,var(--accent-primary)_18%,var(--border-soft))] hover:bg-[color-mix(in_srgb,var(--surface-muted)_38%,var(--surface-root))]',
                      )}
                      onClick={() => toggleValue(option.label)}
                    >
                      <span
                        className={cx(
                          'size-[13px] shrink-0 rounded-full border-[1.5px]',
                          selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] shadow-[inset_0_0_0_4px_var(--surface-root)]' : 'border-[var(--border-strong)] bg-app-bg',
                        )}
                        aria-hidden="true"
                      />
                      <span className="grid min-w-0 grid-cols-[minmax(160px,0.85fr)_minmax(0,1.15fr)] items-baseline gap-2 max-[760px]:grid-cols-1 max-[760px]:gap-0.5">
                        <span className="min-w-0 truncate text-[12px] font-[650] text-app-text">{option.label}</span>
                        {option.description && (
                          <span className="min-w-0 truncate text-[11.5px] leading-[1.3] text-app-text-muted max-[760px]:whitespace-normal">{option.description}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            <label
              className={cx(
                'grid min-h-[38px] grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 rounded-[7px] border px-2.5 py-1.5 transition-[border-color,background] duration-[120ms] focus-within:border-[color-mix(in_srgb,var(--accent-primary)_34%,var(--border-soft))] focus-within:bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--surface-root))]',
                'border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_92%,var(--surface-panel))]',
              )}
            >
              <span
                className={cx(
                  'size-[13px] shrink-0 rounded-full border-[1.5px]',
                  hasCustomAnswer ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] shadow-[inset_0_0_0_4px_var(--surface-root)]' : 'border-[var(--border-strong)] bg-app-bg',
                )}
                aria-hidden="true"
              />
              <textarea
                className="max-h-[58px] min-h-6 w-full resize-none border-0 bg-transparent pt-[3px] text-[12px] leading-[1.35] text-app-text outline-none"
                rows={question.options.length > 0 ? 1 : 2}
                value={customAnswer}
                onChange={(event) => {
                  const value = event.target.value
                  setCustomAnswer(value)
                  if (value.trim()) setSelectedValues([])
                }}
                placeholder={question.options.length > 0 ? 'Autre reponse...' : 'Type your answer...'}
              />
            </label>
          </>
        )}
      </div>

      <div className="flex justify-between gap-2 px-3 pb-3">
        <button
          type="button"
          className="min-w-16 cursor-pointer rounded-md border border-app-border-subtle bg-[color-mix(in_srgb,var(--surface-root)_76%,var(--surface-panel))] px-3 py-1.5 text-[11px] font-[650] text-app-text-muted disabled:cursor-default disabled:opacity-40"
          onClick={goPrev}
          disabled={viewIndex === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="ml-auto min-w-16 cursor-pointer rounded-md border border-app-primary bg-app-primary px-3 py-1.5 text-[11px] font-[650] text-white disabled:cursor-default disabled:opacity-40"
          onClick={goNext}
          disabled={!canSubmit}
        >
          {!isActive ? 'Next' : isLast ? 'Submit' : 'Next'}
        </button>
      </div>
    </div>
  )
}
