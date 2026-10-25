import { existsSync } from 'fs'
import { join } from 'path'

/**
 * The environment a bundled backend needs to start: the folder it sits in comes first on the library path, because the native OCR build is
 * linked to pdfium (and onnxruntime on Windows) and refuses to start when it cannot find them. Windows looks next to the executable by
 * itself, Linux and macOS only through the library path. Used by the sidecar and by the backend commands the first-run setup runs.
 */
export function withBackendLibraries(env: NodeJS.ProcessEnv, backendDir: string, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const next = { ...env }
  if (platform === 'win32') {
    next.PATH = `${backendDir};${next.PATH || ''}`
    const onnxRuntimePath = join(backendDir, 'onnxruntime.dll')
    if (!next.SESHAT_NATIVEDOC_ONNXRUNTIME_PATH && existsSync(onnxRuntimePath)) {
      next.SESHAT_NATIVEDOC_ONNXRUNTIME_PATH = onnxRuntimePath
    }
  } else if (platform === 'linux') {
    next.LD_LIBRARY_PATH = `${backendDir}${next.LD_LIBRARY_PATH ? `:${next.LD_LIBRARY_PATH}` : ''}`
  } else if (platform === 'darwin') {
    next.DYLD_LIBRARY_PATH = `${backendDir}${next.DYLD_LIBRARY_PATH ? `:${next.DYLD_LIBRARY_PATH}` : ''}`
  }
  return next
}
