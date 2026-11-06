import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// The gallery of the components of an answer: `npm run gallery`, then open the address it prints.
export default defineConfig({
  root: resolve('gallery'),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@renderer': resolve('src/renderer') } },
  server: { port: 5199, open: false },
  // Tailwind finds the classes in the sources the gallery imports.
  build: { outDir: resolve('.tmp/gallery'), emptyOutDir: true }
})
