import type { ChangedFile } from '@renderer/lib/changedFiles'
import { FileIcon } from '@renderer/components/ui/FileIcon'
import { useUIStore } from '@renderer/stores/ui'

function folderOf(path: string, name: string): string {
  const folder = path.slice(0, Math.max(0, path.length - name.length)).replace(/[/\\]+$/, '')
  return folder
}

/**
 * Under the end of an answer: the files the agent created or edited during the turn, each with the icon of its type.
 * A click opens the file in the Files panel.
 */
export function ChangedFiles({ files, sessionId }: { files: ChangedFile[]; sessionId?: string }) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  if (files.length === 0) return null
  return (
    <div className="mt-1 w-full overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="border-b border-[var(--border-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {files.length === 1 ? '1 file' : `${files.length} files`}
      </div>
      <ul className="m-0 list-none p-0">
        {files.map((file) => (
          <li key={file.path}>
            <button
              type="button"
              onClick={() => openRightPanel({ kind: 'files', title: 'Files', sessionId, focusToolId: file.toolId })}
              title={file.path}
              className="flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left hover:bg-[var(--surface-hover)]"
            >
              <FileIcon path={file.path} size={18} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{file.name}</span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">{folderOf(file.path, file.name)}</span>
              </span>
              {(file.linesAdded > 0 || file.linesRemoved > 0) && (
                <span className="shrink-0 font-mono text-[11px]">
                  {file.linesAdded > 0 && <span className="text-[var(--accent-success)]">+{file.linesAdded}</span>}
                  {file.linesAdded > 0 && file.linesRemoved > 0 && ' '}
                  {file.linesRemoved > 0 && <span className="text-[var(--accent-danger)]">−{file.linesRemoved}</span>}
                </span>
              )}
              <span
                className={[
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                  file.status === 'created'
                    ? 'bg-[rgba(var(--color-success-rgb),0.14)] text-[var(--accent-success)]'
                    : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
                ].join(' ')}
              >
                {file.status === 'created' ? 'New' : 'Edited'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
