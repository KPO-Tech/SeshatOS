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
    // A copy of process.env is a plain object, so its keys are case-sensitive, and an app started from Explorer gets "Path", not "PATH".
    // Writing PATH beside Path gave the child two of them; Windows keeps the first in sorted order, PATH, which held only this folder, and
    // the backend no longer found git, node or python. Every spelling is folded into one PATH.
    const pathKeys = Object.keys(next).filter((key) => key.toUpperCase() === 'PATH')
    const current = pathKeys.map((key) => next[key]).find((value) => value) || ''
    for (const key of pathKeys) delete next[key]
    next.PATH = `${backendDir};${current}`
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
