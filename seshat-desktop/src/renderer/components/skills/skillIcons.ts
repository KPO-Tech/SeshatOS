/** What a skill is about, read from its name and its description: the icon, the colour and the tags it is shown with. */
export type SkillTopic = {
  id: string
  /** The name in the list of categories. */
  label: string
  /** The words that tell a skill belongs here (the start of a word: "analy" holds analysis, analyze, analytics). */
  words: string[]
}

export const SKILL_TOPICS: SkillTopic[] = [
  { id: 'git', label: 'Version control', words: ['git', 'commit', 'branch', 'pull request', 'merge', 'versioning', 'github', 'gitlab'] },
  { id: 'database', label: 'Databases', words: ['sql', 'database', 'postgres', 'mysql', 'sqlite', 'query', 'mongo', 'redis', 'schema'] },
  { id: 'data', label: 'Data', words: ['chart', 'plot', 'visuali', 'dashboard', 'pandas', 'etl', 'dataset', 'statistic', 'analy', 'csv', 'metric'] },
  { id: 'sheet', label: 'Spreadsheets', words: ['spreadsheet', 'excel', 'xlsx', 'sheet'] },
  { id: 'ai', label: 'AI and learning', words: ['machine learning', 'model', 'train', 'neural', 'scikit', 'tensor', 'llm', 'embedding', 'prompt', 'ml'] },
  { id: 'code', label: 'Development', words: ['code', 'refactor', 'program', 'python', 'javascript', 'typescript', 'golang', 'rust', 'java', 'compile', 'function', 'software'] },
  { id: 'bug', label: 'Quality', words: ['test', 'debug', 'bug', 'lint', 'review', 'quality', 'error'] },
  { id: 'terminal', label: 'Command line', words: ['shell', 'bash', 'terminal', 'command', 'cli', 'powershell', 'script'] },
  { id: 'web', label: 'Web', words: ['web', 'search', 'browse', 'internet', 'website', 'scrap', 'crawl', 'research', 'html', 'seo'] },
  { id: 'cloud', label: 'APIs and cloud', words: ['api', 'rest', 'http', 'cloud', 'aws', 'azure', 'integration', 'webhook', 'graphql', 'saas'] },
  { id: 'deploy', label: 'Deployment', words: ['deploy', 'docker', 'kubernetes', 'ci/cd', 'release', 'infrastructure', 'devops', 'terraform'] },
  { id: 'files', label: 'Files', words: ['file', 'folder', 'workspace', 'directory', 'filesystem', 'organize'] },
  { id: 'pdf', label: 'Documents', words: ['pdf', 'docx', 'word', 'pptx', 'slides', 'presentation'] },
  { id: 'docs', label: 'Writing', words: ['document', 'writing', 'markdown', 'readme', 'docs', 'article', 'blog', 'summar', 'draft', 'edit'] },
  { id: 'media', label: 'Images and video', words: ['image', 'photo', 'picture', 'design', 'logo', 'draw', 'illustrat', 'video', 'animation', 'ocr'] },
  { id: 'audio', label: 'Audio', words: ['audio', 'music', 'speech', 'voice', 'transcri', 'podcast', 'sound'] },
  { id: 'mail', label: 'Communication', words: ['mail', 'email', 'message', 'slack', 'chat', 'notification', 'newsletter'] },
  { id: 'calendar', label: 'Planning', words: ['calendar', 'schedule', 'meeting', 'plan', 'task', 'todo', 'reminder', 'project management'] },
  { id: 'security', label: 'Security', words: ['security', 'vulnerab', 'auth', 'encrypt', 'secret', 'password', 'audit', 'privacy'] },
  { id: 'language', label: 'Languages', words: ['translat', 'language', 'locali', 'grammar', 'spelling'] },
  { id: 'finance', label: 'Finance', words: ['finance', 'invoice', 'budget', 'accounting', 'payment', 'tax', 'bank'] },
  { id: 'science', label: 'Science', words: ['science', 'research paper', 'biolog', 'chemi', 'physic', 'math', 'calcul', 'lab'] },
  { id: 'automation', label: 'Automation', words: ['automat', 'workflow', 'repetitive', 'pipeline', 'batch', 'cron', 'process'] },
  { id: 'agent', label: 'Agents', words: ['agent', 'assistant', 'persona', 'robot', 'delegate'] },
  { id: 'learn', label: 'Learning', words: ['learn', 'teach', 'tutor', 'course', 'explain', 'quiz', 'study'] }
]

/** The icons a skill may take: one for each topic, then a few for the skills that fit none. */
export const SKILL_ICON_IDS = [...SKILL_TOPICS.map((topic) => topic.id), 'bolt', 'magic', 'tool', 'star', 'key'] as const
export type SkillIconId = (typeof SKILL_ICON_IDS)[number]

/** For a skill that fits no topic: a few icons, one of which is taken by the name so that it stays the same each time. */
const GENERAL_ICONS: SkillIconId[] = ['bolt', 'magic', 'tool', 'star', 'key']

type Describable = { name: string; display_name?: string; description?: string }

function textOf(skill: Describable): { name: string; description: string } {
  return { name: `${skill.display_name ?? ''} ${skill.name}`.toLowerCase().replace(/[-_]+/g, ' '), description: (skill.description ?? '').toLowerCase() }
}

/** Whether the text holds the word, or a longer one that starts with it ("analy" in "analyze"), and not the end of another ("ml" in "html"). */
function holds(text: string, word: string): boolean {
  let from = 0
  for (;;) {
    const at = text.indexOf(word, from)
    if (at < 0) return false
    if (at === 0 || !/[a-z0-9]/.test(text[at - 1])) return true
    from = at + 1
  }
}

function hash(text: string): number {
  let value = 0
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) >>> 0
  return value
}

function score(skill: Describable, topic: SkillTopic): number {
  const { name, description } = textOf(skill)
  return topic.words.reduce((total, word) => total + (holds(name, word) ? 3 : 0) + (holds(description, word) ? 1 : 0), 0)
}

/** The topic that fits the skill best, or null when none does. A tie goes to the topic listed first. */
export function topicOf(skill: Describable): SkillTopic | null {
  let best: SkillTopic | null = null
  let bestScore = 0
  for (const topic of SKILL_TOPICS) {
    const value = score(skill, topic)
    if (value > bestScore) {
      best = topic
      bestScore = value
    }
  }
  return best
}

/** The icon of a skill: the one the person chose, else the one of its topic, else one of the general ones taken by its name. */
export function iconFor(skill: Describable, chosen?: string): SkillIconId {
  if (chosen && (SKILL_ICON_IDS as readonly string[]).includes(chosen)) return chosen as SkillIconId
  const topic = topicOf(skill)
  return (topic?.id as SkillIconId | undefined) ?? GENERAL_ICONS[hash(skill.name) % GENERAL_ICONS.length]
}

/** Up to three words that say what the skill is about, in the order the skill uses them. */
export function tagsFor(skill: Describable, limit = 3): string[] {
  const { name, description } = textOf(skill)
  const text = `${name} ${description}`
  const found: Array<{ word: string; at: number }> = []
  for (const topic of SKILL_TOPICS) {
    for (const stem of topic.words) {
      if (stem.length < 3 || !holds(text, stem)) continue
      let at = text.indexOf(stem)
      while (at > 0 && /[a-z0-9]/.test(text[at - 1])) at = text.indexOf(stem, at + 1)
      // The word as the skill writes it ("analyze" for "analy"), not the start that was looked for.
      const word = stem.includes(' ') ? stem : (/^[a-z0-9+#.]+/.exec(text.slice(at))?.[0].replace(/\.$/, '') ?? stem)
      if (!found.some((entry) => entry.word === word)) found.push({ word, at })
    }
  }
  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, limit)
    .map((entry) => entry.word)
}

/** The category a skill is listed under in the filter. */
export function categoryOf(skill: Describable): string {
  return topicOf(skill)?.label ?? 'Other'
}
