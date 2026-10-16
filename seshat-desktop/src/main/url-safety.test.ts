import { describe, expect, it } from 'vitest'
import { isExternalOpenAllowed } from './url-safety'

describe('isExternalOpenAllowed', () => {
  it.each(['http://example.com', 'https://example.com/path?q=1', 'HTTPS://EXAMPLE.COM'])('allows %s', (url) => {
    expect(isExternalOpenAllowed(url)).toBe(true)
  })

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'search-ms:query=a&crumb=location:\\\\evil\\share',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ms-msdt:/id PCWDiagnostic',
    'smb://evil/share',
    'vscode://file/etc/passwd',
    '//example.com',
    'example.com',
    '',
  ])('refuses %s', (url) => {
    expect(isExternalOpenAllowed(url)).toBe(false)
  })
})
