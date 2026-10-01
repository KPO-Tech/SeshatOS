import * as pdfjs from 'pdfjs-dist'
import { ensureDefaultPDFWorker } from './pdfWorker'

ensureDefaultPDFWorker()

export type PDFPagePreview = {
  page: number
  dataURL: string
}

export async function renderPDFPagePreviews(file: File, maxPages = 10): Promise<PDFPagePreview[]> {
  const data = await file.arrayBuffer()
  const pdfDocument = await pdfjs.getDocument({ data }).promise
  const pageCount = Math.min(pdfDocument.numPages, maxPages)
  const previews: PDFPagePreview[] = []

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const targetWidth = 720
    const scale = targetWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) continue
    canvas.width = Math.ceil(scaledViewport.width)
    canvas.height = Math.ceil(scaledViewport.height)
    await page.render({ canvas, canvasContext: context, viewport: scaledViewport }).promise
    previews.push({ page: pageNumber, dataURL: canvas.toDataURL('image/jpeg', 0.86) })
  }

  await pdfDocument.cleanup()
  return previews
}
