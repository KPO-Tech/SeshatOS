import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer')
    }
  },
  test: {
    environment: 'node',
    include: ['src/renderer/**/*.test.ts']
  }
})
