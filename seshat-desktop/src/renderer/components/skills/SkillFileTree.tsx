import { useState } from 'react'
import type { TreeNode } from './skillsTypes'

type TreeProps = {
  nodes: TreeNode[]
  selected: string
  onSelect: (path: string) => void
  depth?: number
}

const rowClass = 'flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[12px] font-semibold'

export function SkillFileTree({ nodes, selected, onSelect, depth = 0 }: TreeProps) {
  return (
    <ul className="grid gap-0.5">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.is_dir ? (
            <Folder node={node} selected={selected} onSelect={onSelect} depth={depth} />
          ) : (
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              style={{ paddingLeft: 8 + depth * 12 }}
              className={[rowClass, node.path === selected ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]'].join(' ')}
            >
              <FileIcon />
              <span className="truncate">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function Folder({ node, selected, onSelect, depth }: { node: TreeNode; selected: string; onSelect: (path: string) => void; depth: number }) {
  // Collapsed by default so a large skill doesn't open as a wall of files;
  // stays open if the selected file lives inside it.
  const [open, setOpen] = useState(() => selected.startsWith(`${node.path}/`))
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={[rowClass, 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'].join(' ')}
      >
        <ChevronIcon open={open} />
        <FolderIcon />
        <span className="truncate">{node.name}</span>
      </button>
      {open && node.children && <SkillFileTree nodes={node.children} selected={selected} onSelect={onSelect} depth={depth + 1} />}
    </>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={open ? 'rotate-90' : ''}><path d="m9 6 6 6-6 6" /></svg>
}

function FileIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></svg>
}

function FolderIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h6l2 3h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
}
