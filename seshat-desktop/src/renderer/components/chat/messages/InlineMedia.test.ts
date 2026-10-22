import { describe, expect, it } from 'vitest'
import type { ToolUseBlock } from '@renderer/api/types'
import { isInlineMedia } from './InlineMedia'

const tool = (name: string, status: ToolUseBlock['_status'], content?: string, isError = false): ToolUseBlock => ({
  type: 'tool_use',
  id: 'toolu_123456',
  name,
  input: {},
  _status: status,
  _result: content === undefined ? undefined : ({ content, isError } as ToolUseBlock['_result']),
})

describe('isInlineMedia', () => {
  it('draws a finished image and a finished clip in the conversation', () => {
    expect(isInlineMedia(tool('generate_image', 'completed', '{"image_base64":"QUJD","mime_type":"image/png"}'))).toBe(true)
    expect(isInlineMedia(tool('generate_image', 'completed', '{"image_url":"https://example.com/a.png"}'))).toBe(true)
    expect(isInlineMedia(tool('text_to_speech', 'completed', '{"audio_base64":"QUJD","content_type":"audio/wav"}'))).toBe(true)
  })

  it('reads an answer stored with a note before the document', () => {
    const wrapped = '[SESHAT_SECURITY: note]\n<quarantined>\n{"image_base64":"QUJD"}\n</quarantined>'
    expect(isInlineMedia(tool('generate_image', 'completed', wrapped))).toBe(true)
  })

  it('keeps the placeholder while the media is being made', () => {
    expect(isInlineMedia(tool('generate_image', 'running'))).toBe(true)
  })

  it('leaves a failure, an answer without media and other tools to the tool block', () => {
    expect(isInlineMedia(tool('generate_image', 'failed', 'boom', true))).toBe(false)
    expect(isInlineMedia(tool('generate_image', 'completed', '{"provider":"openai"}'))).toBe(false)
    expect(isInlineMedia(tool('bash', 'completed', '{"image_base64":"QUJD"}'))).toBe(false)
  })
})
