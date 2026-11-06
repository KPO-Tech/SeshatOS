import { allNodes } from './vars'
import type { UiError, UiNode } from './types'

// The pure part of the quizzes and the flashcards of an answer (ADR 0015): what they hold, what is refused, and the message a reader may
// send once they are done. The answers live in the block itself, so it is a tool to study, not an exam: nothing here is secret.

export const QUIZ_LIMITS = {
  /** Questions of a Quiz, cards of a Flashcards. */
  questions: 20,
  cards: 40,
  /** Choices of a Question. */
  options: 6,
  /** Characters of a question, a card side or an explanation. */
  text: 600,
  /** Characters of the template of a report, and of the message made from it. */
  report: 1000,
  message: 4000
} as const

const QUIZ_FIELDS = ['score', 'total', 'missed'] as const
const CARDS_FIELDS = ['known', 'total', 'again'] as const

const FIELD = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g

/** The message of a report: the template, with {{score}}, {{total}}, {{missed}} (Quiz) or {{known}}, {{total}}, {{again}} (Flashcards) filled. One pass. */
export function fillReport(template: string, values: Record<string, string>): string {
  const message = template.replace(FIELD, (_whole, name: string) => values[name] ?? '')
  return message.length > QUIZ_LIMITS.message ? message.slice(0, QUIZ_LIMITS.message) : message
}

export type QuestionSpec = { text: string; options: string[]; answer: number; explanation?: string }

const isNodeLike = (value: unknown): value is UiNode => typeof value === 'object' && value !== null && (value as UiNode).kind === 'element'

const nodesOf = (value: unknown): UiNode[] => (Array.isArray(value) ? value.filter(isNodeLike) : [])

/** The questions a Quiz holds, the ones that cannot be asked (fewer than two choices, an answer that is no choice) left out. */
export function questionsOf(quiz: Pick<UiNode, 'props'>): QuestionSpec[] {
  const questions: QuestionSpec[] = []
  for (const node of nodesOf(quiz.props.questions).slice(0, QUIZ_LIMITS.questions)) {
    const options = Array.isArray(node.props.options) ? node.props.options.slice(0, QUIZ_LIMITS.options).map(String) : []
    const answer = node.props.answer
    if (typeof node.props.text !== 'string' || options.length < 2 || typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= options.length) continue
    questions.push({ text: node.props.text, options, answer, explanation: typeof node.props.explanation === 'string' ? node.props.explanation : undefined })
  }
  return questions
}

export type CardSpec = { front: string; back: string; tag?: string; note?: string }

/** The cards a Flashcards holds. */
export function cardsOf(deck: Pick<UiNode, 'props'>): CardSpec[] {
  return nodesOf(deck.props.cards)
    .slice(0, QUIZ_LIMITS.cards)
    .filter((node) => typeof node.props.front === 'string' && typeof node.props.back === 'string')
    .map((node) => ({
      front: String(node.props.front),
      back: String(node.props.back),
      tag: typeof node.props.tag === 'string' && node.props.tag !== '' ? node.props.tag : undefined,
      note: typeof node.props.note === 'string' && node.props.note !== '' ? node.props.note : undefined
    }))
}

export function checkQuiz(root: UiNode): UiError[] {
  const errors: UiError[] = []
  const problem = (message: string, hint?: string) => errors.push({ code: 'bad-argument', message, hint })
  const nodes = allNodes(root)
  const inside = new Set<UiNode>()

  const checkReport = (node: UiNode, allowed: readonly string[]) => {
    const report = node.props.report
    if (typeof report !== 'string') return
    if (report.length > QUIZ_LIMITS.report) problem(`The report of a ${node.name} is longer than ${QUIZ_LIMITS.report} characters.`)
    for (const match of report.matchAll(FIELD)) {
      if (!allowed.includes(match[1])) problem(`The report of a ${node.name} uses {{${match[1]}}}, which does not exist.`, `Use ${allowed.map((name) => `{{${name}}}`).join(', ')}.`)
    }
  }
  const checkLength = (what: string, value: unknown) => {
    if (typeof value === 'string' && value.length > QUIZ_LIMITS.text) problem(`${what} is longer than ${QUIZ_LIMITS.text} characters.`)
  }

  for (const quiz of nodes.filter((node) => node.name === 'Quiz')) {
    const questions = nodesOf(quiz.props.questions)
    questions.forEach((question) => inside.add(question))
    if (questions.length === 0) problem('A Quiz needs at least one Question.')
    if (questions.length > QUIZ_LIMITS.questions) problem(`A Quiz holds at most ${QUIZ_LIMITS.questions} questions.`)
    checkReport(quiz, QUIZ_FIELDS)
    questions.forEach((question, index) => {
      const options = Array.isArray(question.props.options) ? question.props.options : []
      const answer = question.props.answer
      const label = `Question ${index + 1}`
      if (options.length < 2 || options.length > QUIZ_LIMITS.options) problem(`${label} needs from 2 to ${QUIZ_LIMITS.options} choices.`)
      if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= options.length) problem(`${label}: answer must be the number of the right choice, counting from 0 (there are ${options.length} choices).`)
      checkLength(label, question.props.text)
      checkLength(`${label} explanation`, question.props.explanation)
      options.forEach((option) => checkLength(`A choice of ${label}`, option))
    })
  }

  for (const deck of nodes.filter((node) => node.name === 'Flashcards')) {
    const cards = nodesOf(deck.props.cards)
    cards.forEach((card) => inside.add(card))
    if (cards.length === 0) problem('Flashcards needs at least one Flash.')
    if (cards.length > QUIZ_LIMITS.cards) problem(`Flashcards holds at most ${QUIZ_LIMITS.cards} cards.`)
    checkReport(deck, CARDS_FIELDS)
    cards.forEach((card, index) => {
      checkLength(`The front of card ${index + 1}`, card.props.front)
      checkLength(`The back of card ${index + 1}`, card.props.back)
      checkLength(`The note of card ${index + 1}`, card.props.note)
    })
  }

  for (const node of nodes) {
    if ((node.name === 'Question' || node.name === 'Flash') && !inside.has(node)) problem(`${node.name} only works inside ${node.name === 'Question' ? 'a Quiz' : 'Flashcards'}.`)
  }
  return errors
}
