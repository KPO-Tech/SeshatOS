import { describe, expect, it } from 'vitest'
import { isRemoteImageSrc, isRenderableImageSrc } from './inlineImage'

describe('isRenderableImageSrc', () => {
  it('renders inline data urls', () => {
    expect(isRenderableImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isRenderableImageSrc('data:image/svg+xml,%3Csvg%3E')).toBe(true)
  })

  it('refuses anything that would fetch over the network', () => {
    expect(isRenderableImageSrc('https://tracker.example/pixel.png')).toBe(false)
    expect(isRenderableImageSrc('http://tracker.example/pixel.png')).toBe(false)
    expect(isRenderableImageSrc('//tracker.example/pixel.png')).toBe(false)
  })

  it('refuses local paths and non-image data urls', () => {
    expect(isRenderableImageSrc('file:///C:/secret.png')).toBe(false)
    expect(isRenderableImageSrc('/workspace/logo.png')).toBe(false)
    expect(isRenderableImageSrc('./logo.png')).toBe(false)
    expect(isRenderableImageSrc('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isRenderableImageSrc('')).toBe(false)
  })
})

describe('isRemoteImageSrc', () => {
  it('flags the http(s) sources the chip can hand to the app browser', () => {
    expect(isRemoteImageSrc('https://example.com/a.png')).toBe(true)
    expect(isRemoteImageSrc('http://example.com/a.png')).toBe(true)
  })

  it('does not flag sources that have no address to open', () => {
    expect(isRemoteImageSrc('//example.com/a.png')).toBe(false)
    expect(isRemoteImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
    expect(isRemoteImageSrc('/workspace/logo.png')).toBe(false)
  })
})
