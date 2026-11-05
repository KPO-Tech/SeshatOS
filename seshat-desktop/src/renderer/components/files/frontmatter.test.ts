import { describe, expect, it } from 'vitest'
import { frontmatterFields, splitFrontmatter } from './frontmatter'

describe('splitFrontmatter', () => {
  it('separates YAML front matter from the markdown body', () => {
    const result = splitFrontmatter('---\nname: game-dev\ndescription: x\n---\n# Title\n\nBody')
    expect(result.frontmatter).toBe('name: game-dev\ndescription: x')
    expect(result.body).toBe('# Title\n\nBody')
  })

  it('returns the whole text as body when there is no front matter', () => {
    expect(splitFrontmatter('# Just markdown')).toEqual({ frontmatter: '', body: '# Just markdown' })
  })
})

describe('frontmatterFields', () => {
  it('reads the one-line fields, without their quotes', () => {
    const fields = frontmatterFields(['name: demo', 'description: "A long one"', 'license: MIT', 'allowed-tools: Read Write Bash'].join('\n'))
    expect(fields).toEqual({ name: 'demo', description: 'A long one', license: 'MIT', 'allowed-tools': 'Read Write Bash' })
  })

  it('leaves out a nested block and its lines, and a folded text', () => {
    const fields = frontmatterFields(['name: demo', 'metadata:', '  version: "1.4"', 'description: >', '  folded text', 'license: Apache-2.0'].join('\n'))
    expect(fields).toEqual({ name: 'demo', license: 'Apache-2.0' })
  })
})
