import { useRef, useEffect, useState, useCallback } from 'react'
import { cx, NOTICE_CSS, TOOL_ICON_CSS } from './chatInputStyles'
import type { ChatInputProps } from './composerTypes'
import { Plus, FolderClose, AtSign, Voice, Send, CheckCorrect, LoadingOne, Browser, SettingTwo } from '@icon-park/react'
import { AttachmentThumb } from '../attachments/AttachmentThumb'
import { PASTE_AS_FILE_THRESHOLD, nextPastedTextFilename } from './pastedTextFilename'
import { api, ApiError } from '@renderer/api/client'
import type { Corpus } from '@renderer/api/types'
import { startWavRecording, type WavRecording } from '@renderer/lib/wavRecorder'
import { SelectorPill, SelectorMenu } from '@renderer/components/ui/SelectorPill'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'

type SkillOption = { Name: string; DisplayName: string; Description: string; Source: string; UserInvocable?: boolean; IsHidden?: boolean }

const EXECUTION_CYCLE: Array<'execute' | 'plan'> = ['execute', 'plan']
const EXECUTION_LABEL: Record<'execute' | 'plan', string> = { execute: 'Execute', plan: 'Plan' }

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  placeholder = 'Send a message...',
  maxHeight = 160,
  isStreaming = false,
  statusText,
  showInlineStatus = true,
  selectedCorpusId,
  onCorpusChange,
  projectPath,
  onProjectChange,
  attachments = [],
  onAttachFiles,
  onRemoveAttachment,
  isUploadingAttachments = false,
  attachmentError,
  providerLabel = 'Provider',
  modelLabel = 'Model',
  modelIcon,
  onProviderClick,
  onModelClick,
  providerOptions,
  modelOptions,
  selectedProviderId,
  selectedModelId,
  onProviderSelect,
  onModelSelect,
  providerDisabled = false,
  modelDisabled = false,
  modelError,
  onModelRetry,
  modelMenuPlacement = 'up',
  executionMode,
  onExecutionModeChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectorsRef = useRef<HTMLDivElement>(null)
  const [openSelector, setOpenSelector] = useState<'provider' | 'model' | null>(null)
  const hasProviderMenu = !!providerOptions?.length && !!onProviderSelect
  const hasModelMenu = !!modelOptions?.length && !!onModelSelect
  const showProviderSelector = Boolean(hasProviderMenu || onProviderClick || providerLabel !== 'Provider')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [slashIdx, setSlashIdx] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [corpora, setCorpora] = useState<Corpus[]>([])
  const [corpusDropdownOpen, setCorpusDropdownOpen] = useState(false)
  const corpusDropdownRef = useRef<HTMLDivElement>(null)
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [recordError, setRecordError] = useState<string | null>(null)
  const wavRecordingRef = useRef<WavRecording | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const canSend = value.trim().length > 0 || attachments.length > 0

  useEffect(() => {
    api.get<{ skills: SkillOption[] }>('/skills')
      .then(d => setSkills((d.skills ?? []).filter(s => s.Source !== 'mcp' && s.UserInvocable !== false && !s.IsHidden)))
      .catch(() => {})
    api.get<{ corpora: Corpus[] }>('/corpora')
      .then(d => setCorpora(d.corpora ?? []))
      .catch(() => {})
  }, [])

  // Release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function handleMicClick() {
    if (recordingState === 'transcribing') return

    if (recordingState === 'recording') {
      setRecordingState('transcribing')
      const blob = await wavRecordingRef.current?.stop()
      wavRecordingRef.current = null
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null

      if (!blob || blob.size <= 44) {
        // Nothing but the WAV header was captured.
        setRecordingState('idle')
        return
      }
      try {
        const form = new FormData()
        form.append('audio', blob, 'recording.wav')
        const result = await api.upload<{ text: string }>('/transcribe', form)
        if (result.text) {
          onChange(value.trim() ? `${value.trim()} ${result.text}` : result.text)
        }
      } catch (err) {
        setRecordError(err instanceof ApiError ? err.message : 'Transcription failed.')
      } finally {
        setRecordingState('idle')
      }
      return
    }

    setRecordError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      wavRecordingRef.current = startWavRecording(stream)
      setRecordingState('recording')
    } catch {
      setRecordError('Microphone access was denied.')
    }
  }

  // Close corpus dropdown on outside click
  useEffect(() => {
    if (!corpusDropdownOpen) return
    function onDown(e: MouseEvent) {
      if (!corpusDropdownRef.current?.contains(e.target as Node)) setCorpusDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [corpusDropdownOpen])

  // Close provider/model dropdown on outside click
  useEffect(() => {
    if (!openSelector) return
    function onDown(e: MouseEvent) {
      if (!selectorsRef.current?.contains(e.target as Node)) setOpenSelector(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openSelector])

  function handleProviderTrigger() {
    if (providerDisabled) return
    if (hasProviderMenu) {
      setOpenSelector((current) => (current === 'provider' ? null : 'provider'))
      return
    }
    onProviderClick?.()
  }

  function handleModelTrigger() {
    if (modelDisabled) return
    if (hasModelMenu) {
      setOpenSelector((current) => (current === 'model' ? null : 'model'))
      return
    }
    onModelClick?.()
  }

  const selectedCorpus = corpora.find(c => c.id === selectedCorpusId) ?? null
  const projectLabel = projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath : null

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (!value) el.style.height = 'auto'
  }, [value])

  // Slash autocomplete state
  const slashMatch = /^\/(\S*)$/.exec(value.trimStart())
  const slashQuery = slashMatch ? slashMatch[1].toLowerCase() : null
  const showSlash = slashQuery !== null
  const filtered = showSlash
    ? skills.filter(s =>
        (s.Name || '').toLowerCase().startsWith(slashQuery) ||
        (s.DisplayName || '').toLowerCase().startsWith(slashQuery)
      ).slice(0, 8)
    : []

  const selectSkill = useCallback((skill: SkillOption) => {
    onChange(`/${skill.Name} `)
    setSlashIdx(0)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [onChange])

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    // A file copied from a file manager (e.g. Explorer) lands in
    // clipboardData.files - attach it the same way as the file picker,
    // instead of pasting its path as text.
    const files = e.clipboardData.files
    if (files.length > 0) {
      e.preventDefault()
      void onAttachFiles?.(files)
      return
    }
    const text = e.clipboardData.getData('text/plain')
    if (text.length <= PASTE_AS_FILE_THRESHOLD) return
    e.preventDefault()
    const file = new File([text], nextPastedTextFilename(attachments), { type: 'text/plain' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    void onAttachFiles?.(transfer.files)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showSlash && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filtered.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(i => (i - 1 + filtered.length) % filtered.length); return }
      if (e.key === 'Tab' || (e.key === 'Enter' && filtered.length > 0 && !e.shiftKey)) {
        e.preventDefault()
        selectSkill(filtered[slashIdx])
        return
      }
      if (e.key === 'Escape') { onChange(''); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) return
      if (canSend) onSend()
    }
  }

  // Reset selected index when filter changes
  useEffect(() => { setSlashIdx(0) }, [slashQuery])

  return (
    <div className="relative rounded-[18px] border border-app-border-subtle bg-[color-mix(in_srgb,var(--color-surface)_92%,var(--color-bg))] px-3.5 pb-2.5 pt-3 shadow-[0_14px_34px_rgba(31,27,23,0.09)] transition-[border-color,box-shadow] duration-[180ms] ease-in-out focus-within:border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border-subtle))] focus-within:shadow-[0_18px_42px_rgba(31,27,23,0.12),0_0_0_2px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]">
      {showSlash && filtered.length > 0 && (
        <div className="absolute inset-x-0 bottom-[calc(100%+8px)] z-[200] max-h-[280px] overflow-y-auto overflow-x-hidden rounded-[10px] border border-[var(--color-border)] bg-app-bg shadow-[0_8px_32px_rgba(0,0,0,0.18)]" ref={dropdownRef}>
          {filtered.map((sk, i) => (
            <button
              key={sk.Name}
              className={cx(
                'flex w-full cursor-pointer items-baseline gap-2.5 border-0 bg-none px-3 py-[9px] text-left transition-colors duration-100',
                i === slashIdx && 'bg-app-surface',
              )}
              onMouseDown={e => { e.preventDefault(); selectSkill(sk) }}
              onMouseEnter={() => setSlashIdx(i)}
            >
              <span className="shrink-0 font-mono text-[13px] font-bold text-[var(--color-cta)]">/{sk.Name}</span>
              {sk.Description && <span className="truncate text-[12px] text-app-text-muted">{sk.Description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Corpus chip */}
      {selectedCorpus && onCorpusChange && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-[7px] border border-[rgba(239,124,47,0.3)] bg-[rgba(239,124,47,0.1)] py-[3px] pl-1.5 pr-2 text-[12px] font-semibold text-[var(--color-primary)]">
          <span className="text-[13px] leading-none">@</span>
          <span className="max-w-[200px] truncate">{selectedCorpus.name}</span>
          <button
            className="flex items-center rounded-[3px] border-0 bg-none p-px text-inherit opacity-70 hover:opacity-100"
            onMouseDown={e => { e.preventDefault(); onCorpusChange(null) }}
            aria-label="Remove knowledge base"
          >
            <WindowCloseIcon />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2.5 flex flex-nowrap gap-2 overflow-x-auto px-0.5 py-[5px]">
          {attachments.map((file) => (
            <AttachmentThumb key={file.id} file={file} size={56} onRemove={onRemoveAttachment} />
          ))}
        </div>
      )}

      {(attachmentError || modelError || recordError) && (
        <div className="mb-2 flex flex-col gap-1" aria-live="polite">
          {attachmentError && <div className={NOTICE_CSS}>{attachmentError}</div>}
          {recordError && <div className={NOTICE_CSS}>{recordError}</div>}
          {modelError && (
            <div className={NOTICE_CSS}>
              <span>{modelError}</span>
              {onModelRetry && (
                <button
                  type="button"
                  className="ml-auto shrink-0 cursor-pointer rounded-app-sm border border-[rgba(var(--color-error-rgb),0.2)] bg-transparent px-[7px] py-0.5 font-bold text-app-error [font-family:inherit] [font-size:inherit] [line-height:inherit] hover:bg-[rgba(var(--color-error-rgb),0.08)]"
                  onClick={onModelRetry}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className="min-h-5 w-full resize-none border-0 bg-transparent text-[13px] leading-[1.55] text-app-text outline-none [font-family:inherit] placeholder:text-app-text-muted"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        rows={1}
      />

      <div className="mt-2.5 flex items-center justify-between gap-2.5" ref={selectorsRef}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            className="flex size-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-app-text-muted transition-[color,transform] duration-150 hover:bg-[var(--color-hover)] hover:text-app-text-secondary disabled:cursor-progress disabled:opacity-55"
            type="button"
            aria-label="Attach files"
            disabled={isUploadingAttachments}
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} />
          </button>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            multiple
            onChange={e => {
              const files = e.currentTarget.files
              if (files && files.length > 0) void onAttachFiles?.(files)
              e.currentTarget.value = ''
            }}
          />
          <div className="flex min-w-0 max-w-[180px] items-center gap-1">
            <button
              className={cx(TOOL_ICON_CSS, projectPath && '!text-[var(--color-primary)]')}
              aria-label={projectPath ? `Project: ${projectPath}` : 'Set project folder'}
              onClick={async () => {
                const result = await window.nexus?.dialog?.openDirectory?.()
                if (result && !result.canceled && result.filePaths?.length) {
                  onProjectChange?.(result.filePaths[0])
                }
              }}
            >
              <FolderClose size={13} />
            </button>
            {projectLabel && (
              <>
                <span className="truncate text-[12px] text-app-text-secondary" title={projectPath}>{projectLabel}</span>
                <button
                  className="flex items-center border-0 bg-transparent p-0.5 text-app-text-muted hover:text-app-text-secondary"
                  aria-label="Clear project folder"
                  onMouseDown={(e) => { e.preventDefault(); onProjectChange?.('') }}
                >
                  <WindowCloseIcon />
                </button>
              </>
            )}
          </div>
          <div className="relative" ref={corpusDropdownRef}>
            <button
              className={cx(TOOL_ICON_CSS, selectedCorpusId && '!text-[var(--color-primary)]')}
              aria-label="Attach knowledge base"
              onClick={() => setCorpusDropdownOpen(v => !v)}
            >
              <AtSign size={13} />
            </button>
            {corpusDropdownOpen && (
              <div className="absolute bottom-[calc(100%+8px)] left-0 z-[200] flex max-w-[280px] min-w-[220px] flex-col overflow-hidden rounded-[10px] border border-[var(--color-border)] bg-app-bg shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
                <div className="border-b border-app-border-subtle px-3.5 pb-1.5 pt-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-app-text-muted">Knowledge bases</div>
                {corpora.length === 0 ? (
                  <div className="p-3.5 text-[13px] text-app-text-muted">No knowledge bases found</div>
                ) : corpora.map(c => {
                  const selected = c.id === selectedCorpusId
                  return (
                    <button
                      key={c.id}
                      className={cx(
                        'flex w-full cursor-pointer items-center justify-between gap-2 border-0 bg-none px-3.5 py-[9px] text-left text-[13px] text-app-text transition-colors duration-100 hover:bg-app-surface',
                        selected && 'bg-app-surface',
                      )}
                      onMouseDown={e => {
                        e.preventDefault()
                        onCorpusChange?.(c.id === selectedCorpusId ? null : c.id)
                        setCorpusDropdownOpen(false)
                      }}
                    >
                      <span className={cx(selected && 'font-bold text-[var(--color-primary)]')}>{c.name}</span>
                      {c.chunk_count > 0 && <span className="whitespace-nowrap text-[11px] text-app-text-muted">{c.chunk_count} chunks</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <div className="relative min-w-0 max-w-[min(240px,32vw)]">
            <SelectorPill
              label={modelLabel}
              icon={modelIcon ?? (hasModelMenu ? <CheckCorrect size={12} /> : <SettingTwo size={12} />)}
              onClick={handleModelTrigger}
              disabled={modelDisabled}
              active={openSelector === 'model'}
              className="h-7 max-w-full !gap-1.5 !px-[9px] !py-0"
            />
            {openSelector === 'model' && modelOptions && onModelSelect && (
              <SelectorMenu
                placement={modelMenuPlacement}
                className="min-w-[330px]"
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={(id) => {
                  setOpenSelector(null)
                  onModelSelect(id)
                }}
              />
            )}
          </div>
          {onExecutionModeChange && (
            <button
              className={cx(
                'flex h-7 shrink-0 cursor-pointer items-center gap-[5px] rounded-app-md border-0 bg-transparent px-2 text-[11px] font-semibold transition-colors duration-150 hover:bg-[var(--color-hover)]',
                executionMode === 'plan' ? 'text-[#60a5fa]' : 'text-[var(--color-primary)]',
              )}
              onClick={() => {
                const current = executionMode === 'plan' ? 'plan' : 'execute'
                const currentIndex = EXECUTION_CYCLE.indexOf(current)
                onExecutionModeChange(EXECUTION_CYCLE[(currentIndex + 1) % EXECUTION_CYCLE.length])
              }}
              type="button"
            >
              <span className={cx('size-[5px] shrink-0 rounded-full', executionMode === 'plan' ? 'bg-[#60a5fa]' : 'bg-[var(--color-primary)]')} />
              <span>{EXECUTION_LABEL[executionMode === 'plan' ? 'plan' : 'execute']}</span>
            </button>
          )}
          {showInlineStatus && isStreaming && (
            <div className="flex min-w-0 max-w-[320px] items-center gap-[7px] text-[12px] text-app-text-secondary" aria-live="polite">
              <LoadingOne size={14} className="animate-[spin_0.9s_linear_infinite]" />
              <span className="truncate">{statusText || 'Running...'}</span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          {showProviderSelector && (
            <div className="relative">
              <SelectorPill
                label={providerLabel}
                icon={<Browser size={12} />}
                onClick={handleProviderTrigger}
                disabled={providerDisabled}
                active={openSelector === 'provider'}
              />
              {openSelector === 'provider' && providerOptions && onProviderSelect && (
                <SelectorMenu
                  placement="up"
                  options={providerOptions}
                  selectedId={selectedProviderId}
                  onSelect={(id) => {
                    setOpenSelector(null)
                    onProviderSelect(id)
                  }}
                />
              )}
            </div>
          )}
          <button
            className={cx(
              'flex h-7 w-6 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-app-text-muted transition-colors duration-150 hover:text-app-text-secondary disabled:cursor-progress disabled:opacity-55',
              recordingState === 'recording' && '![animation:pulse-opacity_1.2s_ease-in-out_infinite] !text-app-error',
            )}
            type="button"
            aria-label={
              recordingState === 'recording'
                ? 'Stop recording'
                : recordingState === 'transcribing'
                  ? 'Transcribing...'
                  : 'Record a voice message'
            }
            disabled={recordingState === 'transcribing'}
            onClick={() => void handleMicClick()}
          >
            {recordingState === 'transcribing'
              ? <LoadingOne size={13} className="animate-[spin_0.9s_linear_infinite]" />
              : <Voice size={13} />}
          </button>
          {isStreaming ? (
            <button
              className="flex size-[30px] items-center justify-center rounded-[9px] border border-[var(--color-primary-hover)] bg-[var(--color-primary-subtle)] text-[var(--color-primary)] transition-all duration-200 hover:bg-[var(--color-primary-hover)]"
              onClick={onStop}
              type="button"
              aria-label="Stop"
            >
              <WindowCloseIcon size={14} />
            </button>
          ) : (
            <button
              className={cx(
                'flex size-[30px] items-center justify-center rounded-[9px] border-0 transition-all duration-200',
                canSend
                  ? 'cursor-pointer bg-[var(--color-primary)] text-white hover:-translate-y-px hover:bg-[var(--color-primary-hover)]'
                  : 'cursor-not-allowed bg-[color-mix(in_srgb,var(--color-surface)_82%,var(--color-bg))] text-app-text-muted',
              )}
              onClick={() => canSend && onSend()}
              type="button"
            >
              <Send size={14} theme={canSend ? 'filled' : 'outline'} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
