import type { ComponentType } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cardsOf, fillReport, QUIZ_LIMITS, questionsOf } from '../../lang/quiz'
import type { UiNode } from '../../lang/types'
import { useRichActionBridge } from '../actions/richActions'
import { text } from '../charts/readers'
import type { ComponentProps } from '../NodeView'
import { MarkdownText } from '../text/MarkdownText'

// The quizzes and the flashcards of an answer (ADR 0015). They keep their progress in this component. The only thing that leaves it is the
// report a reader chooses to send at the end, sent through the same bridge as @Ask: an ordinary message, written after a click, visible.

const BOX = 'my-3 rounded-2xl border border-app-border-subtle bg-app-surface p-4'
const BUTTON =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-app-border-subtle bg-app-surface-elevated px-4 py-2 text-[13px] font-medium text-app-text transition-colors enabled:hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:text-app-text-muted'

/** The button that sends the report, with the reasons it may wait. */
function SendReport({ message }: { message: string }) {
  const { t } = useTranslation('chat')
  const bridge = useRichActionBridge()
  const [sent, setSent] = useState(false)
  if (message.trim() === '') return null
  const why = sent
    ? t('chat.richblocks.view.components.forms.sent')
    : !bridge.ask
      ? t('chat.richblocks.view.components.forms.needsConversation')
      : bridge.busy
        ? t('chat.richblocks.view.components.forms.wait')
        : t('chat.richblocks.view.components.forms.willSend', { text: message.length > 300 ? `${message.slice(0, 297)}...` : message })
  return (
    <button
      type="button"
      disabled={sent || !bridge.ask || bridge.busy}
      title={why}
      onClick={() => {
        bridge.ask?.(message)
        setSent(true)
      }}
      className={BUTTON}
    >
      {sent ? t('chat.richblocks.view.components.forms.sent') : t('chat.richblocks.view.components.quiz.send')}
    </button>
  )
}

function Quiz({ props }: ComponentProps) {
  const { t } = useTranslation('chat')
  const node = useMemo<Pick<UiNode, 'props'>>(() => ({ props }), [props])
  const questions = useMemo(() => questionsOf(node), [node])
  const [picked, setPicked] = useState<Array<number | undefined>>([])
  const [round, setRound] = useState(0)
  if (questions.length === 0) return null

  const answered = questions.filter((_, index) => picked[index] !== undefined).length
  const missed = questions.flatMap((question, index) => (picked[index] !== undefined && picked[index] !== question.answer ? [`- ${question.text}`] : []))
  const score = answered - missed.length
  const done = answered === questions.length
  const template = typeof props.report === 'string' ? props.report.slice(0, QUIZ_LIMITS.report) : ''
  const report = template ? fillReport(template, { score: String(score), total: String(questions.length), missed: missed.join('\n') || '-' }) : ''

  return (
    <div className={BOX} key={round}>
      {text(props.title) && <div className="mb-3 text-[14px] font-semibold text-app-text">{text(props.title)}</div>}
      <ol className="m-0 flex list-none flex-col gap-5 p-0">
        {questions.map((question, index) => {
          const choice = picked[index]
          return (
            <li key={index}>
              <MarkdownText text={`**${index + 1}.** ${question.text}`} className="mb-2 text-app-text" />
              <div role="radiogroup" aria-label={question.text} className="flex flex-col gap-1.5">
                {question.options.map((option, at) => {
                  const chosen = choice === at
                  const right = choice !== undefined && at === question.answer
                  const wrong = chosen && at !== question.answer
                  return (
                    <button
                      key={at}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      disabled={choice !== undefined}
                      onClick={() => setPicked((current) => Object.assign([...current], { [index]: at }))}
                      className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-left text-[13.5px] transition-colors disabled:cursor-default ${
                        right
                          ? 'border-app-success bg-app-success/10 text-app-text'
                          : wrong
                            ? 'border-app-error bg-app-error/10 text-app-text'
                            : 'border-app-border-subtle bg-transparent text-app-text enabled:hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <span className="mt-px w-4 shrink-0 text-app-text-muted">{String.fromCharCode(65 + at)}</span>
                      <span className="min-w-0 flex-1">{option}</span>
                      {right && <span className="shrink-0 text-app-success">{t('chat.richblocks.view.components.quiz.correct')}</span>}
                      {wrong && <span className="shrink-0 text-app-error">{t('chat.richblocks.view.components.quiz.wrong')}</span>}
                    </button>
                  )
                })}
              </div>
              {choice !== undefined && question.explanation && <MarkdownText text={question.explanation} className="mt-2 text-[13px] text-app-text-secondary" />}
            </li>
          )
        })}
      </ol>
      {done && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-0 border-t border-solid border-app-border-subtle pt-3">
          <span className="text-[14px] font-semibold text-app-text">{t('chat.richblocks.view.components.quiz.score', { score, total: questions.length })}</span>
          <span className="flex items-center gap-2">
            <button type="button" className={BUTTON} onClick={() => { setPicked([]); setRound((value) => value + 1) }}>
              {t('chat.richblocks.view.components.quiz.retry')}
            </button>
            {report && <SendReport message={report} />}
          </span>
        </div>
      )}
    </div>
  )
}

/** A Question is read by its Quiz, which draws it: on its own it draws nothing. */
function ReadByParent() {
  return null
}

function Flashcards({ props }: ComponentProps) {
  const { t } = useTranslation('chat')
  const node = useMemo<Pick<UiNode, 'props'>>(() => ({ props }), [props])
  const cards = useMemo(() => cardsOf(node), [node])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [knew, setKnew] = useState<boolean[]>([])
  if (cards.length === 0) return null

  const done = index >= cards.length
  const known = knew.filter(Boolean).length
  const again = cards.flatMap((card, at) => (knew[at] === false ? [card.front] : []))
  const template = typeof props.report === 'string' ? props.report.slice(0, QUIZ_LIMITS.report) : ''
  const report = template ? fillReport(template, { known: String(known), total: String(cards.length), again: again.join(', ') || '-' }) : ''
  const answer = (didKnow: boolean) => {
    setKnew((current) => Object.assign([...current], { [index]: didKnow }))
    setFlipped(false)
    setIndex((value) => value + 1)
  }
  const restart = () => {
    setIndex(0)
    setFlipped(false)
    setKnew([])
  }

  return (
    <div className={BOX}>
      {text(props.title) && <div className="mb-3 text-[14px] font-semibold text-app-text">{text(props.title)}</div>}
      {done ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-app-text">{t('chat.richblocks.view.components.quiz.cardsDone', { known, total: cards.length })}</span>
          <span className="flex items-center gap-2">
            <button type="button" className={BUTTON} onClick={restart}>
              {t('chat.richblocks.view.components.quiz.retry')}
            </button>
            {report && <SendReport message={report} />}
          </span>
        </div>
      ) : (
        <>
          <div className="mb-2 text-[12px] text-app-text-muted">{t('chat.richblocks.view.components.quiz.cardOf', { n: index + 1, total: cards.length })}</div>
          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            aria-label={flipped ? t('chat.richblocks.view.components.quiz.showFront') : t('chat.richblocks.view.components.quiz.flip')}
            className="flex min-h-36 w-full cursor-pointer items-center justify-center rounded-2xl border border-app-border-subtle bg-app-surface-elevated px-6 py-5 text-center text-[16px] text-app-text transition-colors hover:bg-[var(--surface-hover)]"
          >
            <MarkdownText text={flipped ? cards[index].back : cards[index].front} className="text-app-text" />
          </button>
          <div className="mt-3 flex items-center justify-center gap-2">
            {flipped ? (
              <>
                <button type="button" className={BUTTON} onClick={() => answer(false)}>
                  {t('chat.richblocks.view.components.quiz.again')}
                </button>
                <button type="button" className={BUTTON} onClick={() => answer(true)}>
                  {t('chat.richblocks.view.components.quiz.knew')}
                </button>
              </>
            ) : (
              <button type="button" className={BUTTON} onClick={() => setFlipped(true)}>
                {t('chat.richblocks.view.components.quiz.flip')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export const quizComponents: Record<string, ComponentType<ComponentProps>> = { Quiz, Question: ReadByParent, Flashcards, Flash: ReadByParent }
