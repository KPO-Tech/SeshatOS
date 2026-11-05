// What the Ask screen offers before a question is asked. Each entry that starts a question carries the beginning of it: choosing one
// puts it in the input, to finish and send.

export type CapabilityId = 'answer' | 'summarize' | 'analyze' | 'generate' | 'data' | 'sources'

export type Capability = {
  id: CapabilityId
  title: string
  description: string
  // The beginning of the question this card puts in the input.
  prompt: string
  // True for what Ask does not do yet: the card says so and does not start a question.
  soon?: boolean
}

export const CAPABILITIES: Capability[] = [
  { id: 'answer', title: 'knowledge/ask:pages.knowledge.ask.askContent.answerTitle', description: 'knowledge/ask:pages.knowledge.ask.askContent.answerDescription', prompt: 'What do my documents say about ' },
  { id: 'summarize', title: 'knowledge/ask:pages.knowledge.ask.askContent.summarizeTitle', description: 'knowledge/ask:pages.knowledge.ask.askContent.summarizeDescription', prompt: 'Summarize the main points of ' },
  { id: 'analyze', title: 'knowledge/ask:pages.knowledge.ask.askContent.analyzeTitle', description: 'knowledge/ask:pages.knowledge.ask.askContent.analyzeDescription', prompt: 'Compare and analyze what my documents say about ' },
  { id: 'generate', title: 'knowledge/ask:pages.knowledge.ask.askContent.generateTitle', description: 'knowledge/ask:pages.knowledge.ask.askContent.generateDescription', prompt: 'Write a short report on ' },
  { id: 'data', title: 'knowledge/ask:pages.knowledge.ask.askContent.dataTitle', description: 'knowledge/ask:pages.knowledge.ask.askContent.dataDescription', prompt: '', soon: true },
  { id: 'sources', title: 'knowledge/ask:pages.knowledge.ask.askContent.sourcesTitle', description: 'knowledge/ask:pages.knowledge.ask.askContent.sourcesDescription', prompt: '', soon: true }
]

export type Example = { id: string; label: string; prompt: string }

export const EXAMPLES: Example[] = [
  { id: 'main-points', label: 'Summarize the main points of this document', prompt: 'Summarize the main points of this document: ' },
  { id: 'compare', label: 'Compare these two files', prompt: 'Compare these two files: ' },
  { id: 'insights', label: 'What are the key insights from my data?', prompt: 'What are the key insights from ' },
  { id: 'report', label: 'Generate a report on this topic', prompt: 'Generate a report on ' },
  { id: 'code', label: 'Explain this code', prompt: 'Explain this code: ' },
  { id: 'across', label: 'Find information across my sources', prompt: 'Find information across my sources about ' }
]

export const TIPS: string[] = [
  'knowledge/ask:pages.knowledge.ask.askContent.tip1',
  'knowledge/ask:pages.knowledge.ask.askContent.tip2',
  'knowledge/ask:pages.knowledge.ask.askContent.tip3',
  'knowledge/ask:pages.knowledge.ask.askContent.tip4',
  'knowledge/ask:pages.knowledge.ask.askContent.tip5'
]

export const STEPS: { title: string; text: string }[] = [
  { title: 'knowledge/ask:pages.knowledge.ask.askContent.step1Title', text: 'knowledge/ask:pages.knowledge.ask.askContent.step1Text' },
  { title: 'knowledge/ask:pages.knowledge.ask.askContent.step2Title', text: 'knowledge/ask:pages.knowledge.ask.askContent.step2Text' },
  { title: 'knowledge/ask:pages.knowledge.ask.askContent.step3Title', text: 'knowledge/ask:pages.knowledge.ask.askContent.step3Text' },
  { title: 'knowledge/ask:pages.knowledge.ask.askContent.step4Title', text: 'knowledge/ask:pages.knowledge.ask.askContent.step4Text' }
]
