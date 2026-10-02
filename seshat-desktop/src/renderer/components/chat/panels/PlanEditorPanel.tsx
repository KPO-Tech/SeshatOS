import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckOne, CloseOne, Edit, DocDetail } from '@icon-park/react'
import { MarkdownView } from '@renderer/components/MarkdownView'
import { WindowCloseIcon, WindowMaximizeIcon } from '@renderer/components/ui/WindowControlIcon'
import { api } from '@renderer/api/client'
import { useChat } from '@renderer/hooks/useChat'
import { useSessionStore } from '@renderer/stores/session'
import { useUIStore, buildRightPanelId } from '@renderer/stores/ui'
import type { PlanDocument, PlanStatus } from '@renderer/api/types'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const BADGE_CSS: Record<PlanStatus, string> = {
  pending: 'bg-[rgba(239,124,47,0.15)] text-[var(--accent-primary)]',
  validated: 'bg-[rgba(var(--color-success-rgb),0.12)] text-app-success',
  rejected: 'bg-[rgba(var(--color-error-rgb),0.1)] text-app-error',
}

const FRAME_BTN_CSS = 'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text'


type Annotation = {
  id: string
  quote: string
  comment: string
}

function errorMessage(err: unknown): string {
  return (err as { message?: string })?.message ?? 'unknown error'
}

// Splits markdown into top-level blocks (paragraphs, headings, list groups,
// blockquotes...) on blank lines, so each can get its own hover "+" comment
// affordance. A fenced code block is kept intact as a single block even if
// it contains blank lines internally.
function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line.trim())) inFence = !inFence
    if (!inFence && line.trim() === '') {
      if (current.length > 0) {
        blocks.push(current.join('\n'))
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length > 0) blocks.push(current.join('\n'))
  return blocks
}

type Props = {
  // planId is set when the agent submitted a structured plan document via
  // submit_plan; content is fetched/persisted through /plans/:id. When
  // absent, rawContent carries the plain-text plan from exit_plan_mode's
  // toolInput.plan instead: same review experience (markdown, annotations,
  // comments), just nothing to persist server-side, so editing is disabled.
  planId?: string
  sessionId: string
  pendingPermission?: { toolUseId: string } | null
  rawContent?: string
  isMaximized?: boolean
  onClose?: () => void
  onToggleMaximize?: () => void
}

export function PlanEditorPanel({ planId, sessionId, pendingPermission, rawContent, isMaximized, onClose, onToggleMaximize }: Props) {
  const isDocumentBacked = !!planId
  const plan = useSessionStore((s) => (planId ? s.getPlan(sessionId, planId) : undefined))
  const upsertPlan = useSessionStore((s) => s.upsertPlan)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const { sendMessage } = useChat(sessionId)

  const [editMode, setEditMode] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [pendingQuote, setPendingQuote] = useState<string | null>(null)
  const [annotationInput, setAnnotationInput] = useState('')
  const [floatStyle, setFloatStyle] = useState<{ top: number; left: number } | null>(null)
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const floatRef = useRef<HTMLDivElement>(null)
  const markdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (plan?.content) setEditedContent(plan.content)
  }, [plan?.id, plan?.content])

  const loadFull = useCallback(async () => {
    if (!planId || !plan || plan.content) return
    try {
      const full = await api.get<PlanDocument>(`/plans/${planId}`)
      upsertPlan(sessionId, full)
      setEditedContent(full.content)
    } catch (err) {
      // Otherwise this silently leaves the panel stuck on "No plan content
      // yet." forever with no indication anything went wrong.
      setActionError(`Couldn't load the plan content: ${errorMessage(err)}. Reopen the panel to retry.`)
    }
  }, [plan, planId, sessionId, upsertPlan])

  useEffect(() => { void loadFull() }, [loadFull])

  useEffect(() => {
    if (!floatStyle) return
    function handleMouseDown(e: MouseEvent) {
      if (floatRef.current && !floatRef.current.contains(e.target as Node)) {
        closeFloat()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [floatStyle])

  // The form is positioned absolute *within the markdown container itself*
  // (which is position:relative), not fixed in viewport space - so its
  // top/left are offsets from that container's own padding box, not screen
  // coordinates. That's what keeps it glued to the paragraph it's
  // commenting on, scrolling right along with it, and physically unable to
  // render outside the panel/on a "separate column" the way viewport-fixed
  // coordinates could. left is clamped to the container's own width so the
  // (fixed-width) form never overflows it sideways; it's fine for it to
  // overlap the text underneath.
  function clampFloatPosition(top: number, left: number): { top: number; left: number } {
    const FORM_WIDTH = 280
    const containerWidth = markdownRef.current?.clientWidth ?? FORM_WIDTH
    const half = FORM_WIDTH / 2
    const minLeft = Math.min(half + 4, containerWidth / 2)
    const maxLeft = Math.max(containerWidth - half - 4, minLeft)
    return { top, left: Math.min(Math.max(left, minLeft), maxLeft) }
  }

  function handleMarkdownMouseUp() {
    if (editMode || (plan?.status ?? 'pending') !== 'pending') return
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 3 || !sel || sel.rangeCount === 0 || !markdownRef.current) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const containerRect = markdownRef.current.getBoundingClientRect()
    setPendingQuote(text)
    setAnnotationInput('')
    setShowAnnotationForm(false)
    setFloatStyle(clampFloatPosition(
      rect.bottom - containerRect.top + 8,
      rect.left - containerRect.left + rect.width / 2,
    ))
  }

  // Hovering a block (paragraph, heading, list group...) while not editing
  // reveals a "+" in its gutter - clicking it opens the same annotation
  // form used by text selection, seeded with that block's own text as the
  // quote, so a single line/section can be commented on without first
  // having to select it.
  function openLineComment(e: React.MouseEvent<HTMLButtonElement>, block: string) {
    e.stopPropagation()
    if (!markdownRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const containerRect = markdownRef.current.getBoundingClientRect()
    const quote = block.trim().split('\n')[0].slice(0, 120)
    setPendingQuote(quote)
    setAnnotationInput('')
    setShowAnnotationForm(true)
    setFloatStyle(clampFloatPosition(
      rect.bottom - containerRect.top + 6,
      rect.left - containerRect.left + 60,
    ))
  }

  function closeFloat() {
    setFloatStyle(null)
    setPendingQuote(null)
    setAnnotationInput('')
    setShowAnnotationForm(false)
    window.getSelection()?.removeAllRanges()
  }

  function addAnnotation() {
    if (!pendingQuote || !annotationInput.trim()) return
    setAnnotations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), quote: pendingQuote, comment: annotationInput.trim() },
    ])
    closeFloat()
  }

  function removeAnnotation(id: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }

  function buildFeedback(): string {
    const parts: string[] = []
    if (annotations.length > 0) {
      parts.push(
        '**Plan annotations:**\n\n' +
        annotations.map((a) => `> "${a.quote}"\n${a.comment}`).join('\n\n')
      )
    }
    if (isDocumentBacked && editMode && editedContent !== plan?.content) {
      parts.push("I've also updated the plan content directly.")
    }
    return parts.join('\n\n')
  }

  const content = plan?.content ?? rawContent ?? ''

  // The header still needs to render here (not just once real content is
  // ready) - otherwise a slow load or a load failure leaves the panel with
  // no close/maximize control at all, since the generic RightPanelHost
  // header no longer exists as a fallback for plan panels (see PanelFrame).
  const minimalHeader = (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-app-border-subtle px-[11px] py-2.5">
      <div className="flex items-center gap-1.5">
        <DocDetail size={13} className="shrink-0 text-[var(--accent-primary)]" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-app-text">Implementation Plan</span>
        {onToggleMaximize && (
          <button className={FRAME_BTN_CSS} type="button" onClick={onToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
            <WindowMaximizeIcon />
          </button>
        )}
        {onClose && (
          <button className={FRAME_BTN_CSS} type="button" onClick={onClose} aria-label="Close">
            <WindowCloseIcon />
          </button>
        )}
      </div>
    </div>
  )

  if (isDocumentBacked && !plan) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {minimalHeader}
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-[11px] text-app-text-muted">Loading plan…</div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {minimalHeader}
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-[22px] text-[11px] text-app-text-muted">
          <span className={cx(actionError && 'text-center text-app-error')}>
            {actionError ?? 'No plan content yet.'}
          </span>
          {isDocumentBacked && (
            <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-[5px] border border-app-border-subtle bg-transparent px-[7px] py-1 text-[10px] font-medium text-app-text-muted transition-all duration-150 hover:bg-[var(--surface-hover)] hover:text-app-text" onClick={() => void loadFull()}>
              Retry
            </button>
          )}
        </div>
      </div>
    )
  }

  const status = plan?.status ?? 'pending'
  const isReadonly = status !== 'pending'
  const contentToShow = editMode ? editedContent : (content || editedContent)
  const humanSlug = plan
    ? plan.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Implementation Plan'

  const hasFeedback = annotations.length > 0 || (isDocumentBacked && editMode && editedContent !== content)

  async function handleProceed() {
    if (sending || !(pendingPermission || isDocumentBacked)) return
    setSending(true)
    setActionError(null)
    try {
      if (isDocumentBacked && editMode && editedContent !== plan!.content) {
        try {
          const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { content: editedContent })
          upsertPlan(sessionId, updated)
        } catch (err) {
          // Don't approve on the model's behalf with edits it never saw -
          // stop here rather than silently proceeding without them.
          setActionError(`Couldn't save your edits: ${errorMessage(err)}. Not approved yet — try again.`)
          return
        }
      }

      if (pendingPermission) {
        // Legacy path: the model already called exit_plan_mode itself and is
        // blocked waiting on exactly this permission - resolving it in the
        // same request unblocks that turn directly, no new message needed.
        // The plan_id tells the backend to sync plan_documents.status in the
        // same request as the approval - see permissions.go's handler.
        await api.post(`/permissions/${pendingPermission.toolUseId}`, {
          approved: true,
          session_id: sessionId,
          plan_id: planId,
        })
        if (isDocumentBacked) upsertPlan(sessionId, { ...plan!, status: 'validated' })
        useSessionStore.getState().updateAgentState(sessionId, { pendingPermission: null })
      } else {
        // submit_plan doesn't block the turn (RequiresPermission: false) -
        // by the time the plan reaches review, the model's turn has already
        // ended and nothing is listening on a permission channel. The only
        // way to tell it the plan is approved is a new turn - see
        // submit_plan's own prompt ("you will receive a confirmation
        // message - then call exit_plan_mode").
        //
        // sendMessage() silently no-ops if a turn is already streaming on
        // this session (see useChat.ts) - checked here, before the PATCH,
        // so a plan never gets marked validated with no way to actually
        // notify the model of it.
        if (useSessionStore.getState().isSessionStreaming(sessionId)) {
          setActionError("The agent is still running another turn on this session — wait for it to finish, then try again.")
          return
        }
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'validated' })
        upsertPlan(sessionId, updated)
        // Fire-and-forget: sendMessage's promise only resolves once the
        // model's entire follow-up turn finishes (every tool call it makes
        // while implementing the plan), which can take minutes. Awaiting it
        // here would leave this panel open with its buttons disabled for
        // that whole time instead of closing immediately so the user can
        // watch the execution in the main chat.
        void sendMessage('The plan has been approved. Proceed with implementation: call exit_plan_mode, then execute the plan.')
      }

      // Computer is opt-in only - approving just closes this panel and
      // lets the agent resume; it doesn't open Computer on the user's
      // behalf (see TitlebarSessionControls's toggleComputer for the explicit path).
      closeRightPanel(buildRightPanelId({ kind: 'plan', sessionId, planId }))
    } catch (err) {
      setActionError(`Couldn't approve the plan: ${errorMessage(err)}. Nothing was sent — try again.`)
    } finally {
      setSending(false)
    }
  }

  // Reject and "send feedback" are the same action. When exit_plan_mode is
  // actually blocked (legacy path), denying it with the feedback as the deny
  // reason lets the model see it as the tool's rejection text and revise
  // within the same turn. Otherwise (the normal submit_plan path, no live
  // permission to deny) the feedback is sent as a new turn instead - same
  // reasoning as handleProceed's else branch.
  async function handleDeny() {
    if (sending || !(pendingPermission || isDocumentBacked)) return
    setSending(true)
    setActionError(null)
    try {
      if (isDocumentBacked && editMode && editedContent !== plan!.content) {
        try {
          const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { content: editedContent })
          upsertPlan(sessionId, updated)
        } catch (err) {
          // buildFeedback() below tells the model "I've also updated the plan
          // content directly" whenever content differs - that claim has to be
          // true before it's sent, same reasoning as handleProceed.
          setActionError(`Couldn't save your edits: ${errorMessage(err)}. Feedback not sent — try again.`)
          return
        }
      }

      if (pendingPermission) {
        // Same plan_id-carrying request as handleProceed - see its comment.
        await api.post(`/permissions/${pendingPermission.toolUseId}`, {
          approved: false,
          session_id: sessionId,
          reason: hasFeedback ? buildFeedback() : '',
          plan_id: planId,
        })
        if (isDocumentBacked) upsertPlan(sessionId, { ...plan!, status: 'rejected' })
        useSessionStore.getState().updateAgentState(sessionId, { pendingPermission: null })
      } else {
        // Same isSessionStreaming guard as handleProceed - see its comment.
        if (useSessionStore.getState().isSessionStreaming(sessionId)) {
          setActionError("The agent is still running another turn on this session — wait for it to finish, then try again.")
          return
        }
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'rejected' })
        upsertPlan(sessionId, updated)
        // Fire-and-forget - see handleProceed's comment on why this isn't awaited.
        void sendMessage(
          hasFeedback
            ? buildFeedback()
            : "I'd like changes before approving this plan. Please revise and resubmit it with submit_plan."
        )
      }
      setAnnotations([])
      setEditMode(false)
      closeRightPanel(buildRightPanelId({ kind: 'plan', sessionId, planId }))
    } catch (err) {
      setActionError(`Couldn't send your feedback: ${errorMessage(err)}. The agent was not notified — try again.`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-app-border-subtle px-[11px] py-2.5">
        <div className="flex items-center gap-1.5">
          <DocDetail size={13} className="shrink-0 text-[var(--accent-primary)]" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-app-text">{humanSlug}</span>
          {isDocumentBacked && !isReadonly && (
            <button
              className={cx(
                'inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 transition-all duration-150',
                editMode ? 'bg-[rgba(239,124,47,0.12)] text-[var(--accent-primary)]' : 'bg-transparent text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text',
              )}
              type="button"
              onClick={() => setEditMode((v) => !v)}
              aria-label={editMode ? 'Preview' : 'Edit'}
            >
              <Edit size={11} />
            </button>
          )}
          <span className={cx('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]', BADGE_CSS[status])}>{status}</span>
          {onToggleMaximize && (
            <button className={FRAME_BTN_CSS} type="button" onClick={onToggleMaximize} aria-label={isMaximized ? 'Restore' : 'Maximize'}>
              <WindowMaximizeIcon />
            </button>
          )}
          {onClose && (
            <button className={FRAME_BTN_CSS} type="button" onClick={onClose} aria-label="Close">
              <WindowCloseIcon />
            </button>
          )}
        </div>
        {plan && <div className="text-[10px] text-app-text-muted">{plan.filename} · v{plan.version}</div>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:var(--border-soft)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-[3px] [&::-webkit-scrollbar-thumb]:bg-app-border-subtle [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1">
        {editMode ? (
          <textarea
            className="box-border w-full flex-1 resize-none border-0 bg-transparent px-[13px] py-[11px] font-['JetBrains_Mono','Fira_Code',monospace] text-[11px] leading-[1.6] text-app-text outline-none [min-height:300px]"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            spellCheck={false}
            autoFocus
          />
        ) : (
          <div className="relative flex-1 select-text px-[13px] py-[11px]" ref={markdownRef} onMouseUp={handleMarkdownMouseUp}>
            {!contentToShow ? (
              <span className="text-[13px] text-app-text-muted">Loading content…</span>
            ) : isReadonly ? (
              <MarkdownView sessionId={sessionId}>{contentToShow}</MarkdownView>
            ) : (
              splitMarkdownBlocks(contentToShow).map((block, i) => (
                <div key={i} className="group relative rounded-md pl-5 transition-colors duration-[120ms] hover:bg-[rgba(239,124,47,0.05)]">
                  <button
                    type="button"
                    className="absolute left-0 top-1 flex size-[17px] scale-[0.8] cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--accent-primary)] text-[12px] font-bold leading-none text-white opacity-0 shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-[opacity,transform] duration-[120ms] group-hover:scale-100 group-hover:opacity-100"
                    aria-label="Comment on this section"
                    onClick={(e) => openLineComment(e, block)}
                  >
                    +
                  </button>
                  <MarkdownView sessionId={sessionId}>{block}</MarkdownView>
                </div>
              ))
            )}

            {floatStyle && pendingQuote && (
              <div
                ref={floatRef}
                className="absolute z-20 flex -translate-x-1/2 flex-col items-stretch [filter:drop-shadow(0_4px_16px_rgba(0,0,0,0.35))]"
                style={{ top: floatStyle.top, left: floatStyle.left }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {showAnnotationForm ? (
                  <div className="flex w-[280px] flex-col gap-1.5 rounded-lg border border-app-border-subtle bg-[rgba(38,36,44,0.98)] p-[7px]">
                    <div className="truncate border-l-2 border-[var(--accent-primary)] pl-1.5 text-[10px] italic text-app-text-muted">"{pendingQuote}"</div>
                    <textarea
                      className="box-border w-full resize-none rounded-[5px] border border-app-border-subtle bg-[rgba(255,255,255,0.04)] px-1.5 py-[5px] text-[10px] text-app-text outline-none transition-colors duration-150 [font-family:inherit] focus:border-[rgba(239,124,47,0.4)]"
                      autoFocus
                      rows={3}
                      placeholder="Your comment on this selection…"
                      value={annotationInput}
                      onChange={(e) => setAnnotationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addAnnotation() }
                        if (e.key === 'Escape') closeFloat()
                      }}
                    />
                    <div className="flex justify-end gap-[5px]">
                      <button type="button" className="cursor-pointer rounded-[5px] border border-app-border-subtle bg-transparent px-[7px] py-[3px] text-[10px] text-app-text-muted hover:bg-[var(--surface-hover)] hover:text-app-text" onClick={closeFloat}>Cancel</button>
                      <button
                        type="button"
                        className="cursor-pointer rounded-[5px] border-0 bg-[var(--accent-primary)] px-[7px] py-[3px] text-[10px] font-semibold text-white transition-opacity duration-[120ms] disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={addAnnotation}
                        disabled={!annotationInput.trim()}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer whitespace-nowrap rounded-md border-0 bg-[var(--accent-primary)] px-2 py-1 text-[10px] font-semibold text-white transition-colors duration-[120ms] hover:bg-[rgba(239,124,47,0.9)]"
                    onClick={() => setShowAnnotationForm(true)}
                  >
                    ✎ Comment
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!isReadonly && annotations.length > 0 && (
        <div className="flex shrink-0 flex-col gap-[5px] px-2.5">
          <div className="flex items-center justify-between pt-2 text-[10px] font-semibold uppercase tracking-[0.05em] text-app-text-muted">
            Annotations ({annotations.length})
            <button
              type="button"
              className="cursor-pointer border-0 bg-none p-0 text-[10px] font-medium normal-case tracking-normal text-app-text-muted transition-colors duration-[120ms] hover:text-app-error"
              onClick={() => setAnnotations([])}
            >
              clear all
            </button>
          </div>
          {annotations.map((a) => (
            <div key={a.id} className="flex items-start gap-1.5 rounded-md border border-[rgba(239,124,47,0.15)] bg-[rgba(239,124,47,0.05)] px-[7px] py-1.5">
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <div className="truncate border-l-2 border-[var(--accent-primary)] pl-[5px] text-[10px] italic text-app-text-muted">"{a.quote}"</div>
                <div className="text-[10px] leading-[1.45] text-app-text">{a.comment}</div>
              </div>
              <button
                type="button"
                className="flex shrink-0 cursor-pointer items-center border-0 bg-none p-0.5 text-app-text-muted opacity-50 transition-opacity duration-[120ms] hover:text-app-error hover:opacity-100"
                onClick={() => removeAnnotation(a.id)}
                aria-label="Remove"
              >
                <CloseOne size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <div className="mx-[11px] mb-2 shrink-0 rounded-md border border-[rgba(var(--color-error-rgb),0.3)] bg-[rgba(var(--color-error-rgb),0.08)] px-[9px] py-[7px] text-[10.5px] leading-[1.4] text-app-error">{actionError}</div>
      )}

      {!isReadonly && (pendingPermission || isDocumentBacked) && (
        <div className="flex shrink-0 items-center justify-between gap-[9px] border-t border-app-border-subtle bg-[rgba(0,0,0,0.08)] px-2.5 py-[7px]">
          <span className="flex-1 text-[10px] text-app-text-muted">
            {hasFeedback
              ? 'Sends your feedback to the agent, which revises the plan right away'
              : 'Hover a section for + to comment, or select a range of lines'}
          </span>
          <div className="flex shrink-0 gap-[5px]">
            <button
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-app-border-subtle bg-transparent px-2.5 py-[5px] text-[10px] font-semibold text-app-text-muted transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:border-[rgba(var(--color-error-rgb),0.3)] enabled:hover:bg-[rgba(var(--color-error-rgb),0.08)] enabled:hover:text-app-error"
              type="button"
              onClick={() => void handleDeny()}
              disabled={sending}
            >
              <CloseOne size={10} />
              {hasFeedback ? 'Send Feedback' : 'Reject'}
            </button>
            <button
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[rgba(var(--color-success-rgb),0.3)] bg-[rgba(var(--color-success-rgb),0.12)] px-2.5 py-[5px] text-[10px] font-semibold text-app-success transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:border-[rgba(var(--color-success-rgb),0.5)] enabled:hover:bg-[rgba(var(--color-success-rgb),0.22)]"
              type="button"
              onClick={() => void handleProceed()}
              disabled={sending}
            >
              <CheckOne size={10} />
              Proceed
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
