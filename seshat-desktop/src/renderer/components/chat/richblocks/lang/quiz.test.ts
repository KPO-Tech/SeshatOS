import { describe, expect, it } from 'vitest'
import { cardsOf, fillReport, QUIZ_LIMITS, questionsOf } from './quiz'
import { parseUi } from './parseUi'

const QUIZ = `root = Quiz([Question("Which keyword starts a goroutine?", ["go", "async"], 0, "go f()"), Question("Two plus two?", ["3", "4", "5"], 1)], "Go", "Score {{score}}/{{total}}: {{missed}}")`
const CARDS = `root = Flashcards([Flash("goroutine", "a light thread"), Flash("channel", "a typed pipe")], "Words", "{{known}} of {{total}}, review {{again}}")`

const problems = (source: string) => parseUi(source, { streaming: false }).errors.map((error) => error.message)

describe('a quiz and flashcards in an answer', () => {
  it('are read with their questions and cards, and nothing is reported', () => {
    const quiz = parseUi(QUIZ, { streaming: false })
    expect(quiz.errors).toEqual([])
    expect(questionsOf(quiz.root!)).toEqual([
      { text: 'Which keyword starts a goroutine?', options: ['go', 'async'], answer: 0, explanation: 'go f()' },
      { text: 'Two plus two?', options: ['3', '4', '5'], answer: 1, explanation: undefined }
    ])
    const cards = parseUi(CARDS, { streaming: false })
    expect(cards.errors).toEqual([])
    expect(cardsOf(cards.root!).map((card) => card.front)).toEqual(['goroutine', 'channel'])
    const tagged = parseUi('root = Flashcards([Flash("a", "b", "Travel", "an example")])', { streaming: false })
    expect(tagged.errors).toEqual([])
    expect(cardsOf(tagged.root!)[0]).toMatchObject({ tag: 'Travel', note: 'an example' })
  })

  it('are refused when an answer is no choice, or a question has a single choice', () => {
    expect(problems('root = Quiz([Question("q", ["a", "b"], 2)])').some((message) => message.includes('answer must be the number'))).toBe(true)
    expect(problems('root = Quiz([Question("q", ["only"], 0)])').some((message) => message.includes('from 2 to'))).toBe(true)
  })

  it('are refused with too many questions, cards or choices', () => {
    const questions = Array.from({ length: QUIZ_LIMITS.questions + 1 }, () => 'Question("q", ["a", "b"], 0)').join(', ')
    expect(problems(`root = Quiz([${questions}])`).some((message) => message.includes('at most'))).toBe(true)
    const choices = Array.from({ length: QUIZ_LIMITS.options + 1 }, (_, i) => `"c${i}"`).join(', ')
    expect(problems(`root = Quiz([Question("q", [${choices}], 0)])`).some((message) => message.includes('from 2 to'))).toBe(true)
    const cards = Array.from({ length: QUIZ_LIMITS.cards + 1 }, () => 'Flash("a", "b")').join(', ')
    expect(problems(`root = Flashcards([${cards}])`).some((message) => message.includes('at most'))).toBe(true)
  })

  it('are refused when a report names something that does not exist', () => {
    expect(problems('root = Quiz([Question("q", ["a", "b"], 0)], null, "{{nobody}}")').some((message) => message.includes('{{nobody}}'))).toBe(true)
    expect(problems('root = Flashcards([Flash("a", "b")], null, "{{score}}")').some((message) => message.includes('{{score}}'))).toBe(true)
  })

  it('are refused outside their container', () => {
    expect(problems('root = Stack([Question("q", ["a", "b"], 0)])').some((message) => message.includes('only works inside a Quiz'))).toBe(true)
    expect(problems('root = Stack([Flash("a", "b")])').some((message) => message.includes('only works inside Flashcards'))).toBe(true)
  })
})

describe('the report of a quiz', () => {
  it('fills the figures once, and gives nothing for a name it does not know', () => {
    expect(fillReport('{{score}}/{{total}} {{x}}', { score: '3', total: '5' })).toBe('3/5 ')
  })

  it('does not read again what it has put in', () => {
    expect(fillReport('{{missed}}', { missed: '{{score}}', score: '9' })).toBe('{{score}}')
  })

  it('is cut at the limit', () => {
    expect(fillReport('{{missed}}', { missed: 'x'.repeat(QUIZ_LIMITS.message + 10) }).length).toBe(QUIZ_LIMITS.message)
  })
})
