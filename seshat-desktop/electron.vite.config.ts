import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron']
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
