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
    include: ['src/renderer/**/*.test.ts', 'src/main/*.test.ts'],
    // i18n/index.ts lists the catalogues with import.meta.glob. A transformed module cached on disk would keep the list it had when it was
    // cached, and a new catalogue file would not be seen until the cache is cleared.
    experimental: { fsModuleCache: false }
  }
})
