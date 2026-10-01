import { useEffect, useRef, useState } from 'react'
import { Reduce, Add, Download } from '@icon-park/react'
import { useUIStore } from '@renderer/stores/ui'
import { WindowCloseIcon } from '@renderer/components/ui/WindowControlIcon'

const glassButton = 'flex cursor-pointer items-center justify-center border-0 bg-white/10 text-white/85 transition-colors duration-150 hover:bg-white/20 hover:text-white'

export function ImageLightbox() {
  const image = useUIStore((s) => s.lightboxImage)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const closeLightbox = useUIStore((s) => s.closeLightbox)
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    setNaturalSize(null)
    setScale(1)
  }, [image?.url])

  useEffect(() => {
    if (!image) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [image, closeLightbox])

  if (!image) return null

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setNaturalSize({ width: naturalWidth, height: naturalHeight })
    const container = containerRef.current
    if (!container || !naturalWidth || !naturalHeight) return
    const fit = Math.min(container.clientWidth / naturalWidth, container.clientHeight / naturalHeight, 1)
    setScale(fit > 0 ? fit : 1)
  }

  function zoomBy(factor: number) {
    setScale((current) => Math.max(0.1, Math.min(current * factor, 6)))
  }

  function download() {
    const link = document.createElement('a')
    link.href = image!.url
    link.download = image!.filename
    link.click()
  }

  return (
    <div
      className="absolute bottom-0 right-0 top-0 z-[60] flex flex-col bg-[rgba(10,10,12,0.94)]"
      style={{ left: sidebarCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)' }}
      role="dialog"
      aria-modal="true"
      onMouseDown={closeLightbox}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-2.5" onMouseDown={(e) => e.stopPropagation()}>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[var(--font-size-sm)] text-white/85">{image.filename}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button className={`${glassButton} size-[26px] rounded-md`} type="button" onClick={download} aria-label="Download">
            <Download size={13} />
          </button>
          <button className={`${glassButton} size-[26px] rounded-md`} type="button" onClick={closeLightbox} aria-label="Close">
            <WindowCloseIcon size={14} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-3" ref={containerRef} onMouseDown={(e) => e.stopPropagation()}>
        <img
          className="block max-w-none rounded-md shadow-[0_20px_70px_rgba(0,0,0,0.5)]"
          src={image.url}
          alt={image.filename}
          onLoad={onImageLoad}
          style={naturalSize ? { width: naturalSize.width * scale, height: naturalSize.height * scale } : undefined}
        />
      </div>
      <div className="flex shrink-0 items-center justify-center gap-2.5 px-4 pb-4 pt-2.5" onMouseDown={(e) => e.stopPropagation()}>
        <button className={`${glassButton} size-[30px] rounded-full`} type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
          <Reduce size={13} />
        </button>
        <span className="min-w-10 text-center text-[var(--font-size-sm)] text-white/80">{Math.round(scale * 100)}%</span>
        <button className={`${glassButton} size-[30px] rounded-full`} type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
          <Add size={13} />
        </button>
      </div>
    </div>
  )
}
