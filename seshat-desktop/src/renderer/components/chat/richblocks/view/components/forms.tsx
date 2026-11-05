import type { ComponentType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isNode } from '../../lang/parseUi'
import { counterState, FIELD_NAME, FORM_LIMITS, fieldsOf, fillTemplate, wordCount } from '../../lang/forms'
import type { UiNode } from '../../lang/types'
import { useRichActionBridge } from '../actions/richActions'
import { finite, strings, text, withUnit } from '../charts/readers'
import { FormContext, useForm, useRichBlockKey, type FormState } from '../forms/FormContext'
import { blockHash, loadForm, saveForm } from '../forms/formStorage'
import type { ComponentProps } from '../NodeView'
import { NodeList } from '../NodeView'
import { TONE_TEXT, toneOrNull, type Tone } from '../tones'

// The forms of an answer (ADR 0013). A Form keeps what the reader types in this component; the only thing that leaves it is the message of
// its Submit, sent through the same bridge as @Ask: an ordinary message of the reader, written after a click and visible in the chat.

const BOX = 'my-3 rounded-2xl border border-app-border-subtle bg-app-surface p-4'
const INPUT =
  'w-full rounded-xl border border-app-border-subtle bg-transparent px-3.5 py-2.5 text-[14px] leading-6 text-app-text outline-none placeholder:text-app-text-muted focus:border-[var(--accent-primary)] read-only:opacity-70'

function Form({ props }: ComponentProps) {
  const { t } = useTranslation('chat')
  const bridge = useRichActionBridge()
  const blockKey = useRichBlockKey()
  const form = useMemo<UiNode>(() => ({ kind: 'element', name: 'Form', props }), [props])
  const fields = useMemo(() => fieldsOf(form).slice(0, FORM_LIMITS.fields), [form])
  const defaults = useMemo(() => Object.fromEntries(fields.map((field) => [field.name, field.value])), [fields])
  const submit = isNode(props.submit) ? props.submit : null

  const [values, setValues] = useState<Record<string, string>>(() => (blockKey ? loadForm(blockKey)?.values ?? {} : {}))
  const [sent, setSent] = useState(() => (blockKey ? loadForm(blockKey)?.sent ?? false : false))
  useEffect(() => {
    if (blockKey) saveForm(blockKey, { values, sent })
  }, [blockKey, values, sent])

  const valueOf = (name: string) => values[name] ?? defaults[name] ?? ''
  const state: FormState = {
    valueOf,
    setValue: (name, value) => setValues((current) => ({ ...current, [name]: value.slice(0, FORM_LIMITS.typed) })),
    locked: sent
  }

  const template = submit && typeof submit.props.template === 'string' ? submit.props.template.slice(0, FORM_LIMITS.template) : ''
  const required = submit && Array.isArray(submit.props.requires) ? strings(submit.props.requires) : fields.map((field) => field.name)
  const filled = required.every((name) => valueOf(name).trim() !== '')
  const message = fillTemplate(template, valueOf)
  const why = sent
    ? t('chat.richblocks.view.components.forms.sent')
    : !filled
      ? t('chat.richblocks.view.components.forms.fillIn')
      : !bridge.ask
        ? t('chat.richblocks.view.components.forms.needsConversation')
        : bridge.busy
          ? t('chat.richblocks.view.components.forms.wait')
          : t('chat.richblocks.view.components.forms.willSend', { text: message.length > 300 ? `${message.slice(0, 297)}...` : message })
  const enabled = Boolean(submit) && !sent && filled && Boolean(bridge.ask) && !bridge.busy && message.trim() !== ''

  function send() {
    if (!enabled) return
    bridge.ask?.(message)
    setSent(true)
  }

  return (
    <FormContext.Provider value={state}>
      <div className={BOX}>
        {typeof props.title === 'string' && <div className="mb-3 text-[14px] font-semibold text-app-text">{props.title}</div>}
        <div className="flex flex-col gap-3">
          <NodeList nodes={props.children} />
        </div>
        {submit && (
          <div className="mt-3 flex items-center justify-end gap-3">
            {sent && <span className="text-[12.5px] text-app-text-muted">{t('chat.richblocks.view.components.forms.sent')}</span>}
            <button
              type="button"
              disabled={!enabled}
              title={why}
              onClick={send}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-app-border-subtle bg-app-surface-elevated px-4 py-2 text-[13px] font-medium text-app-text transition-colors enabled:hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:text-app-text-muted"
            >
              {String(submit.props.label)}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </FormContext.Provider>
  )
}

/** The Submit is drawn by its Form, at the foot of it: one met anywhere else draws nothing. */
function Submit() {
  return null
}

function TextArea({ props }: ComponentProps) {
  const form = useForm()
  const name = text(props.name)?.trim() ?? ''
  if (!form || !FIELD_NAME.test(name)) return null
  const rows = Math.min(14, Math.max(2, Math.round(finite(props.rows) ?? 5)))
  return (
    <textarea
      value={form.valueOf(name)}
      readOnly={form.locked}
      rows={rows}
      maxLength={FORM_LIMITS.typed}
      placeholder={text(props.placeholder)}
      aria-label={text(props.placeholder) ?? name}
      onChange={(event) => form.setValue(name, event.target.value)}
      className={`${INPUT} resize-y [font-family:inherit]`}
    />
  )
}

function Field({ props }: ComponentProps) {
  const form = useForm()
  const name = text(props.name)?.trim() ?? ''
  if (!form || !FIELD_NAME.test(name)) return null
  const label = text(props.label)
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[12.5px] font-medium text-app-text-secondary">{label}</span>}
      <input
        type="text"
        value={form.valueOf(name)}
        readOnly={form.locked}
        maxLength={FORM_LIMITS.typed}
        placeholder={text(props.placeholder)}
        aria-label={label ?? text(props.placeholder) ?? name}
        onChange={(event) => form.setValue(name, event.target.value)}
        className={INPUT}
      />
    </label>
  )
}

const COUNTER_TONE = { under: 'text-app-text-muted', inside: 'text-app-success', over: 'text-app-warning', none: 'text-app-text-muted' } as const

function Counter({ props }: ComponentProps) {
  const { t } = useTranslation('chat')
  const form = useForm()
  const of = text(props.of)?.trim() ?? ''
  if (!form || !FIELD_NAME.test(of)) return null
  const min = finite(props.min)
  const max = finite(props.max)
  const count = wordCount(form.valueOf(of))
  const unit = text(props.unit) ?? t('chat.richblocks.view.components.forms.words')
  const range = min !== undefined && max !== undefined ? ` (${min}-${max})` : min !== undefined ? ` (min ${min})` : max !== undefined ? ` (max ${max})` : ''
  return (
    <div className={`text-[12.5px] ${COUNTER_TONE[counterState(count, min, max)]}`} aria-live="polite">
      {`${count} ${unit}${range}`}
    </div>
  )
}

function Draft({ props }: ComponentProps) {
  const { t } = useTranslation('chat')
  const blockKey = useRichBlockKey()
  const initial = useMemo(
    () => ({ to: text(props.to) ?? '', subject: text(props.subject) ?? '', body: String(props.body ?? '').slice(0, FORM_LIMITS.typed) }),
    [props.to, props.subject, props.body]
  )
  const storeKey = blockKey ? `${blockKey}.draft.${blockHash(initial.body)}` : undefined
  const [edited, setEdited] = useState<Record<string, string>>(() => (storeKey ? loadForm(storeKey)?.values ?? {} : {}))
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (storeKey) saveForm(storeKey, { values: edited, sent: false })
  }, [storeKey, edited])
  const value = (name: 'to' | 'subject' | 'body') => edited[name] ?? initial[name]
  const change = (name: string, next: string) => setEdited((current) => ({ ...current, [name]: next.slice(0, FORM_LIMITS.typed) }))
  const rows = Math.min(20, Math.max(6, value('body').split('\n').length + 1))

  async function copy() {
    const subject = value('subject').trim()
    try {
      await navigator.clipboard.writeText(`${subject ? `${subject}\n\n` : ''}${value('body')}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // The clipboard may be refused: the text is still on screen to select.
    }
  }

  return (
    <div className={BOX}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[13px] font-medium text-app-text-secondary">{text(props.title) ?? t('chat.richblocks.view.components.forms.draft')}</div>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex cursor-pointer items-center rounded-lg border border-app-border-subtle bg-transparent px-2.5 py-1 text-[12.5px] text-app-text-secondary transition-colors hover:bg-[var(--surface-hover)] hover:text-app-text"
        >
          {copied ? t('chat.richblocks.view.components.forms.copied') : t('chat.richblocks.view.components.forms.copy')}
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {props.to !== undefined && (
          <label className="flex items-center gap-3 border-0 border-b border-solid border-app-border-subtle pb-2">
            <span className="w-16 shrink-0 text-[12.5px] text-app-text-muted">{t('chat.richblocks.view.components.forms.to')}</span>
            <input type="text" value={value('to')} onChange={(event) => change('to', event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-app-text outline-none" />
          </label>
        )}
        {props.subject !== undefined && (
          <label className="flex items-center gap-3 border-0 border-b border-solid border-app-border-subtle pb-2">
            <span className="w-16 shrink-0 text-[12.5px] text-app-text-muted">{t('chat.richblocks.view.components.forms.subject')}</span>
            <input type="text" value={value('subject')} onChange={(event) => change('subject', event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium text-app-text outline-none" />
          </label>
        )}
        <textarea
          value={value('body')}
          rows={rows}
          maxLength={FORM_LIMITS.typed}
          aria-label={t('chat.richblocks.view.components.forms.draft')}
          onChange={(event) => change('body', event.target.value)}
          className="w-full resize-y border-0 bg-transparent p-0 text-[14px] leading-[1.7] text-app-text outline-none [font-family:inherit]"
        />
      </div>
    </div>
  )
}

function ProgressBar({ props }: ComponentProps) {
  const value = finite(props.value) ?? 0
  const max = finite(props.max)
  const top = max !== undefined && max > 0 ? max : 100
  const share = Math.min(1, Math.max(0, value / top))
  const tone: Tone = toneOrNull(props.tone) ?? 'orange'
  const label = text(props.label)
  return (
    <div className="my-2">
      {label && <div className="mb-1 text-[12.5px] text-app-text-secondary">{label}</div>}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.min(top, Math.max(0, value))} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-app-surface-elevated">
        <div className={`h-full rounded-full bg-current ${TONE_TEXT[tone]}`} style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </div>
    </div>
  )
}

const SEGMENT_TONES: Tone[] = ['blue', 'green', 'orange', 'violet', 'red', 'teal']

function SegmentBar({ props }: ComponentProps) {
  const segments = (Array.isArray(props.segments) ? props.segments : [])
    .filter(isNode)
    .map((node, index) => ({
      label: String(node.props.label),
      value: Math.max(0, finite(node.props.value) ?? 0),
      tone: toneOrNull(node.props.tone) ?? SEGMENT_TONES[index % SEGMENT_TONES.length]
    }))
  if (segments.length === 0) return null
  const unit = text(props.unit)
  const weight = (value: number) => Math.max(value, 0.01)
  return (
    <div className={BOX}>
      {text(props.title) && <div className="mb-3 text-[14px] font-semibold text-app-text">{text(props.title)}</div>}
      <div className="flex gap-1.5" role="img" aria-label={segments.map((segment) => `${segment.label}: ${withUnit(segment.value, unit)}`).join(', ')}>
        {segments.map((segment, index) => (
          <div key={index} className={`h-2 min-w-1.5 rounded-full bg-current ${TONE_TEXT[segment.tone]}`} style={{ flexGrow: weight(segment.value), flexBasis: 0 }} />
        ))}
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {segments.map((segment, index) => (
          <div key={index} className="min-w-0 text-left" style={{ flexGrow: weight(segment.value), flexBasis: 0 }}>
            <div className="text-[15px] font-medium text-app-text">{withUnit(segment.value, unit)}</div>
            <div className="text-[12px] leading-snug text-app-text-muted">{segment.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** One part of a SegmentBar, met anywhere else: it draws nothing, the bar reads it. */
function Segment() {
  return null
}

export const formComponents: Record<string, ComponentType<ComponentProps>> = { Form, Submit, TextArea, Field, Counter, Draft, ProgressBar, SegmentBar, Segment }
