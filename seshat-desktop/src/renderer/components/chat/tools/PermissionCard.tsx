import { Caution } from '@icon-park/react'
import type { ToolUseBlock } from '@renderer/api/types'
import { useUIStore } from '@renderer/stores/ui'
import { permissionSignature } from '@renderer/lib/permissionSignature'
import { fallbackApprovalDescription, toolIcon } from './helpers'
import { toolLabel } from './toolDisplay'

type Props = {
  tool: ToolUseBlock
  // remember, when true, is "Always Allow" instead of "Allow once" - it
  // rides the existing POST /permissions/{tool_use_id} call (as `remember`
  // in the body) rather than opening a second approval path. The backend
  // turns that into the classifier-recognized "always" signal, so this
  // grants for the rest of the session at the permission-engine level, not
  // just a local UI memory of "don't show this card again" (see
  // seshat-backend's query.go promptFn closure and broker.go's
  // PermissionDecision).
  onApprove?: (toolUseId: string, remember?: boolean) => void
  onDeny?: (toolUseId: string) => void
}

// Standalone card for a tool call awaiting user approval — rendered by
// MessageItem in place of ToolBlock for the awaiting_approval status (not
// embedded inside a tool's own expanded card). Calls the existing
// onApprove/onDeny props threaded down from Conversation.tsx's
// handlePermissionDecision (which POSTs to /permissions/{tool_use_id}) —
// does not make its own API call, to avoid a second, divergent approval path.
export function PermissionCard({ tool, onApprove, onDeny }: Props) {
  const rememberApproval = useUIStore((s) => s.rememberApproval)
  const description = tool._approval?.description || fallbackApprovalDescription(tool)
  const snippet = commandSnippet(tool)

  function handleAlwaysAllow() {
    // Local memory is still useful as an instant, zero-round-trip UI
    // suppression for the exact-signature Ask case it already covered -
    // the durable, engine-level grant now comes from onApprove's remember
    // flag instead, which is what actually stops a Deny from recurring.
    rememberApproval(permissionSignature(tool.name, tool.input))
    onApprove?.(tool.id, true)
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-[11px] border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.05)] px-[11px] py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(251,191,36,0.12)] text-[#fbbf24]">
          <Caution size={13} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="text-[12px] font-bold leading-[1.4] text-app-text">
            Allow Claude to run <span className="inline-flex items-center gap-[3px] text-app-text">{toolIcon(tool.name)}{toolLabel(tool.name)}</span>?
          </div>
          <div className="text-[11px] leading-[1.5] text-app-text-muted">{description}</div>
        </div>
      </div>

      {snippet && (
        <div className="overflow-hidden rounded-md bg-[rgba(0,0,0,0.3)]">
          <pre className="m-0 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-all px-2 py-1.5 font-['JetBrains_Mono','Fira_Code',monospace] text-[10px] leading-[1.5] text-app-text-secondary">{snippet}</pre>
        </div>
      )}

      <div className="flex justify-end gap-1.5">
        {onDeny && (
          <button
            className="cursor-pointer whitespace-nowrap rounded-md border border-app-border-subtle bg-transparent px-[11px] py-1 text-[11px] font-semibold text-app-text-muted transition-all duration-150 hover:bg-[var(--color-hover)] hover:text-app-text"
            type="button"
            onClick={() => onDeny(tool.id)}
          >
            Deny
          </button>
        )}
        {onApprove && (
          <>
            <button
              className="cursor-pointer whitespace-nowrap rounded-md border border-app-border-subtle bg-transparent px-[11px] py-1 text-[11px] font-semibold text-app-text-muted transition-all duration-150 hover:bg-[var(--color-hover)] hover:text-app-text"
              type="button"
              onClick={handleAlwaysAllow}
            >
              Always allow
            </button>
            <button
              className="cursor-pointer whitespace-nowrap rounded-md border border-[rgba(var(--color-success-rgb),0.3)] bg-[rgba(var(--color-success-rgb),0.15)] px-[11px] py-1 text-[11px] font-semibold text-app-success transition-all duration-150 hover:border-[rgba(var(--color-success-rgb),0.5)] hover:bg-[rgba(var(--color-success-rgb),0.25)]"
              type="button"
              onClick={() => onApprove(tool.id)}
            >
              Allow once
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function commandSnippet(tool: ToolUseBlock): string {
  if (typeof tool.input.command === 'string' && tool.input.command.trim()) return tool.input.command
  const first = Object.values(tool.input)[0]
  if (typeof first === 'string') return first.slice(0, 400)
  if (Object.keys(tool.input).length === 0) return ''
  return JSON.stringify(tool.input, null, 2).slice(0, 400)
}
