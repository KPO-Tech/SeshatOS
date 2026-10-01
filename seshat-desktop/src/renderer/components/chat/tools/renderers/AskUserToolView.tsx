import { useMemo } from 'react'
import {
  ASK_ANSWER_VALUE_CSS,
  ASK_CARD_PENDING_CSS,
  ASK_NOTE_CSS,
  ASK_PENDING_NOTE_CSS,
  ASK_QA_CSS,
  ASK_QA_COPY_CSS,
  ASK_QA_INDEX_CSS,
  ASK_QUESTION_CSS,
  ASK_SUMMARY_CSS,
  CodeBox,
  Section,
} from '../common'
import { parseAskUserAnswers, resolveAskUserQuestions } from '../helpers'
import type { ToolViewProps } from '../types'
import { GenericToolView } from './GenericToolView'

// Read-only: answering an ask_user_question call happens in AskUserPanel,
// docked above the message box (see Conversation.tsx's pendingAskUser).
// This inline card's only jobs are (a) point there while a question is
// actively pending, and (b) once answered, be the permanent Q&A record in
// the transcript - it never renders its own inputs.
export function AskUserToolView({ tool, result, status }: ToolViewProps) {
  const prompt = tool._prompt
  const questions = useMemo(() => resolveAskUserQuestions(tool.input, prompt), [prompt, tool.input])
  const answers = parseAskUserAnswers(result?.content)

  if (questions.length === 0 && !prompt) {
    return <GenericToolView tool={tool} result={result} status={status} />
  }

  if (status === 'running' && prompt) {
    return (
      <div className={ASK_CARD_PENDING_CSS}>
        <span className={ASK_PENDING_NOTE_CSS}>Waiting for your answer above the message box.</span>
      </div>
    )
  }

  return (
    <div className={ASK_SUMMARY_CSS}>
      {questions.map((question, index) => {
        const answer = answers.get(question.question) ?? ''

        return (
          <div key={`${question.header}-${index}`} className={ASK_QA_CSS}>
            <span className={ASK_QA_INDEX_CSS}>{index + 1}</span>
            <div className={ASK_QA_COPY_CSS}>
              <div className={ASK_QUESTION_CSS}>{question.question}</div>
              {answer ? (
                <div className={ASK_ANSWER_VALUE_CSS}>{answer}</div>
              ) : (
                <div className={ASK_NOTE_CSS}>No answer recorded yet.</div>
              )}
            </div>
          </div>
        )
      })}

      {status === 'running' && !result?.content && !prompt && (
        <div className={ASK_NOTE_CSS}>Waiting for the user response.</div>
      )}

      {status === 'failed' && result?.content && (
        <Section label="Error">
          <CodeBox content={result.content} variant="error" copyable />
        </Section>
      )}
    </div>
  )
}
