import assert from 'node:assert/strict'
import test from 'node:test'
import { titleModelRejection } from './title-model-guard.js'

test('accepts small instruct models', () => {
  for (const name of ['Qwen/Qwen2.5-0.5B-Instruct-GGUF/qwen2.5-0.5b-instruct-q4_k_m.gguf', 'unsloth/gemma-3-270m-it-GGUF/gemma-3-270m-it-Q4_K_M.gguf', 'x/Qwen3-4B-Instruct-2507-GGUF/q4.gguf']) {
    assert.equal(titleModelRejection(name), null, name)
  }
})

test('refuses reasoning models', () => {
  for (const name of ['', 'unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/m.gguf', 'x/Qwen3-0.6B-GGUF/m.gguf', 'x/Qwen3-4B-Thinking-2507-GGUF/m.gguf', 'x/qwq-32b-GGUF/m.gguf', 'x/gpt-oss-20b-GGUF/m.gguf']) {
    assert.notEqual(titleModelRejection(name), null, name)
  }
})
