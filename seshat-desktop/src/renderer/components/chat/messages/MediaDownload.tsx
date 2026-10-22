import { Download } from '@icon-park/react'

export function MediaDownload({ href, filename }: { href: string; filename: string }) {
  return (
    <a
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[rgba(0,0,0,0.55)] text-white no-underline backdrop-blur-sm hover:bg-[rgba(0,0,0,0.75)]"
      href={href}
      download={filename}
      aria-label="Download"
      title="Download"
      onClick={(event) => event.stopPropagation()}
    >
      <Download size={14} />
    </a>
  )
}
