import { useState } from 'react'
import { Down } from '@icon-park/react'
import { CodeBox } from '../common'
import type { ToolViewProps } from '../types'
import { useTranslation } from 'react-i18next'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Detects genuine JSON content (result.content for tools with no dedicated
// renderer can be JSON, prose, or a log dump - only pretty-print/colorize
// when it actually parses) and re-serializes it indented, same treatment
// JsonToolView gives its own tools.
function jsonOrRaw(content: string): { text: string; isJson: boolean } {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return { text: content, isJson: false }
  try {
    return { text: JSON.stringify(JSON.parse(trimmed), null, 2), isJson: true }
  } catch {
    return { text: content, isJson: false }
  }
}

// The body of a tool with no renderer of its own. It is read inline, under
// its row, so what the tool returned comes first and the arguments it was
// called with wait behind a disclosure: the result is what the reader came
// for, and the input JSON above it was noise on every single call.
export function GenericToolView({ tool, result }: ToolViewProps) {
  const { t } = useTranslation('chat')
  const [showInput, setShowInput] = useState(false)
  const output = result?.content ? jsonOrRaw(result.content) : null
  const metadataStr = !result?.content && result?.metadata ? JSON.stringify(result.metadata, null, 2) : ''
  const inputStr = JSON.stringify(tool.input, null, 2)

  return (
    <div className="flex flex-col gap-1.5">
      {output && (
        <CodeBox
          content={output.text}
          copyable
          language={output.isJson ? 'json' : undefined}
          variant={result?.isError ? 'error' : undefined}
        />
      )}
      {!output && metadataStr && <CodeBox content={metadataStr} copyable language="json" />}
      {inputStr !== '{}' && (
        <>
          <button
            type="button"
            aria-expanded={showInput}
            className="flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[10px] font-semibold text-app-text-muted hover:text-app-text-secondary"
            onClick={() => setShowInput((value) => !value)}
          >
            <span className={cx('inline-flex transition-transform duration-150', showInput && 'rotate-180')}>
              <Down size={10} />
            </span>
            {t('chat.tools.renderers.genericToolView.input')}
          </button>
          {showInput && <CodeBox content={inputStr} copyable language="json" />}
        </>
      )}
    </div>
  )
}
