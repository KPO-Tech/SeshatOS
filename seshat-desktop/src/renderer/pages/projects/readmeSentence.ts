import { descriptionFromReadme } from '@renderer/lib/readmeDescription'

// The names a README goes by; a case-sensitive disk (Linux) tells them apart, Windows and macOS do not.
const README_NAMES = ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README.txt', 'README']

/** The sentence that says what the project in a folder is, from its README, or an empty string when it has none or says nothing. */
export async function readmeSentence(rootPath: string): Promise<string> {
  const read = window.seshat?.fs?.readTextFile
  if (!read) return ''
  const separator = rootPath.includes('\\') ? '\\' : '/'
  for (const name of README_NAMES) {
    try {
      const sentence = descriptionFromReadme(await read(`${rootPath.replace(/[\\/]+$/, '')}${separator}${name}`))
      if (sentence) return sentence
    } catch {
      // no such file, or not text: the next name
    }
  }
  return ''
}
