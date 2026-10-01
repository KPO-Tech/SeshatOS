import { describe, expect, it } from 'vitest'
import { splitFrontmatter } from './skillContent'

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
