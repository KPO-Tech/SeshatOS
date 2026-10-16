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
    }
  }
})
