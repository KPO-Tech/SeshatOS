import { Copy, LinkOne } from '@icon-park/react'
import { openInAppBrowser } from '@renderer/lib/openInAppBrowser'
import type { DropdownItem } from './Dropdown'

/** A menu line that opens an address (a repository, a page) in the app's browser. */
export function openItem(id: string, label: string, url: string): DropdownItem {
  return { id, label, icon: <LinkOne theme="outline" size={14} />, onSelect: () => openInAppBrowser(url) }
}

/** A menu line that copies a text, and says so. */
export function copyItem(id: string, label: string, text: string, onCopied: (message: string) => void): DropdownItem {
  return {
    id,
    label,
    icon: <Copy theme="outline" size={14} />,
    onSelect: () => {
      void navigator.clipboard.writeText(text).then(
        () => onCopied('Copied.'),
        () => onCopied('Could not copy.')
      )
    }
  }
}
