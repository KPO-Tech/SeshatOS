import { EXAMPLE_TITLES, PROMPT_EXAMPLES } from '../examples'
import { BRAND } from './brand'
import { CALCULATORS } from './calculators'
import { CLOUD } from './cloud'
import { DASHBOARDS } from './dashboards'
import { DATA } from './data'
import { LANDING } from './landing'
import { LEARNING } from './learning'
import { MATH } from './math'
import { MOBILE } from './mobile'
import type { Gallery } from './types'
import { WORK } from './work'

export type { Gallery, GalleryExample, GalleryTone } from './types'

// The examples the agent is taught from, as a gallery of their own: they are the shortest and the plainest, and the first thing to look at.
const CORE: Gallery = {
  id: 'core',
  title: 'The agent’s examples',
  description: 'The short examples the agent is taught from: tables, steps, charts, forms and a first sketch of a page.',
  tone: 'slate',
  icon: 'ai',
  examples: PROMPT_EXAMPLES.map((code, index) => ({ title: EXAMPLE_TITLES[index] ?? `Example ${index + 1}`, about: '', code }))
}

/** Every gallery, in the order they are shown. */
export const GALLERIES: Gallery[] = [LANDING, MOBILE, DASHBOARDS, BRAND, MATH, CALCULATORS, DATA, CLOUD, LEARNING, WORK, CORE]
