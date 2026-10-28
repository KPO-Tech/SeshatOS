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
  { id: 'answer', title: 'Answer questions', description: 'Get precise information from your documents', prompt: 'What do my documents say about ' },
  { id: 'summarize', title: 'Summarize', description: 'Turn long documents into clear summaries', prompt: 'Summarize the main points of ' },
  { id: 'analyze', title: 'Analyze', description: 'Extract insights and compare information', prompt: 'Compare and analyze what my documents say about ' },
  { id: 'generate', title: 'Generate content', description: 'Create text, reports, or explanations', prompt: 'Write a short report on ' },
  { id: 'data', title: 'Use your data', description: 'Query tables, code snippets and datasets', prompt: '', soon: true },
  { id: 'sources', title: 'Work with sources', description: 'Combine multiple files and data sources', prompt: '', soon: true }
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
  'Be specific in your question',
  'Reference a file or collection if needed',
  'Ask follow-up questions',
  'Use natural language',
  'Combine information from multiple sources'
]

export const STEPS: { title: string; text: string }[] = [
  { title: 'You ask', text: 'Write a question in your own words, and choose where to look: every collection or one.' },
  { title: 'Seshat searches', text: 'It looks for the passages of your documents that answer, by meaning, and by words when your question holds a code or a number.' },
  { title: 'It answers from them', text: 'The answer is written only from those passages, and each claim points to the passage it comes from.' },
  { title: 'You check', text: 'Open a passage to read it in its document, at the right page. Nothing leaves your computer except what the model you chose needs to write the answer.' }
]
