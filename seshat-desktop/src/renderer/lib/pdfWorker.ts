import * as pdfjs from 'pdfjs-dist'

let defaultWorkerPort: Worker | null = null

export function createPDFWorkerPort(): Worker {
  return new Worker(new URL('./pdfWorkerEntry.ts', import.meta.url), { type: 'module' })
}

export function ensureDefaultPDFWorker(): void {
  if (!defaultWorkerPort) {
    defaultWorkerPort = createPDFWorkerPort()
    pdfjs.GlobalWorkerOptions.workerPort = defaultWorkerPort
  }
}
