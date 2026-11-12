import { describe, expect, it } from 'vitest'
import { isAppNavigation, isExternalOpenAllowed } from './url-safety'

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

describe('isAppNavigation', () => {
  const packaged = 'file:///C:/Program%20Files/SeshatOS/resources/app.asar/out/renderer/index.html'

  it('allows the app itself, at any route', () => {
    expect(isAppNavigation(`${packaged}#/conversation/abc`, packaged)).toBe(true)
    expect(isAppNavigation('file:///c:/program files/SeshatOS/resources/app.asar/out/renderer/index.html', packaged)).toBe(true)
    expect(isAppNavigation('http://localhost:5173/#/settings', 'http://localhost:5173')).toBe(true)
  })

  it.each([
    'file:///C:/Users/me/Downloads/page.html',
    'file:///C:/Users/me/report.pdf',
    'https://example.com/',
    'http://localhost:5174/',
    'data:text/html,<p>x</p>',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isAppNavigation(url, packaged)).toBe(false)
    expect(isAppNavigation(url, 'http://localhost:5173')).toBe(false)
  })
})
