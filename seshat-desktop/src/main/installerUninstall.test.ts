import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The uninstaller may offer to delete the data of the person: it must never do so by surprise. These checks read the script and keep the
// guards that say when it is allowed to ask and what it deletes.
const script = readFileSync(join(__dirname, '..', '..', 'build', 'installer.nsh'), 'utf-8').replace(/\r\n/g, '\n')
const macro = script.slice(script.indexOf('!macro customUnInstall'), script.indexOf('!macroend', script.indexOf('!macro customUnInstall')))

describe('the data question of the uninstaller', () => {
  it('is asked only for a real uninstall, never as the first step of an update, and never when the uninstaller runs silently', () => {
    expect(macro).toContain('${ifNot} ${isUpdated}')
    expect(macro).toContain('${ifNot} ${Silent}')
  })

  it('keeps the data unless the person answers yes: No is the default button', () => {
    expect(macro).toContain('MB_YESNO')
    expect(macro).toContain('MB_DEFBUTTON2')
    expect(macro).toMatch(/IDNO seshatKeepData/)
  })

  it('deletes only the folders it names in the question', () => {
    const deleted = [...macro.matchAll(/RMDir \/r "([^"]+)"/g)].map((match) => match[1])
    expect(deleted).toEqual(['$PROFILE\\.config\\seshat', '$LOCALAPPDATA\\seshat-desktop-updater', '$LOCALAPPDATA\\Programs\\seshat'])
    for (const folder of deleted) expect(macro).toContain(`IfFileExists "${folder}\\*.*"`)
  })

  it('tells the person, on the first page of the uninstaller, that they will be asked', () => {
    expect(script).toContain('it asks whether to keep your conversations, settings and downloaded models')
  })
})
