// The logos of the skill repositories we offer, as each project publishes them in its own repository. A repository with no logo of its own
// (K-Dense, ppt-master, paperasse) is absent on purpose: its skills keep the icon chosen from what they do, not an invented mark.
const FILES: Record<string, string> = {
  'remotion-skills': 'remotion',
  superpowers: 'superpowers',
  strix: 'strix',
  'linkedin-skills': 'linkedin'
}

const URLS = import.meta.glob('../../assets/skill-logos/*.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

/** The logo of a skill repository, by the name of its folder (the collection of its skills), or undefined when it has none. */
export function repoLogo(repoName: string | undefined): string | undefined {
  const file = repoName ? FILES[repoName] : undefined
  if (!file) return undefined
  return URLS[`../../assets/skill-logos/${file}.svg`] ?? URLS[`../../assets/skill-logos/${file}.png`]
}
