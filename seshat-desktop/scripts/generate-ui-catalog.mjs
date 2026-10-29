// Rewrites seshat-backend/internal/query/richui_catalog.spec.json from the catalog of rich answer components.
import { spawnSync } from 'node:child_process'

const run = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'src/renderer/components/chat/richblocks/catalog/promptSpec.test.ts'],
  { stdio: 'inherit', env: { ...process.env, UPDATE_UI_CATALOG: '1' } }
)
process.exit(run.status ?? 1)
