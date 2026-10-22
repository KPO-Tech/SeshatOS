import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // node-pty is a native module: it cannot be bundled, so it stays a
        // runtime require and is shipped unpacked (see package.json build).
        external: ['electron', 'node-pty']
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()],
    publicDir: resolve('public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer')
      }
    },
    server: {
      // Transform the modules of the first screen as soon as the dev server is up, while Electron is still starting, so the page does
      // not wait for them one request at a time (on a slow disk, tens of seconds).
      warmup: { clientFiles: ['./main.tsx'] }
    },
    optimizeDeps: {
      // The dependency scan does not follow the imports of a worker, so Vite found the PDF worker only when the page asked for it,
      // optimized it then, and reloaded the whole page (about 16 seconds after the app was first usable, on a cold cache).
      include: ['pdfjs-dist/build/pdf.worker.mjs']
    }
  }
})
