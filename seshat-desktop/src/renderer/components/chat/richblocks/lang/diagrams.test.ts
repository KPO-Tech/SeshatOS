import { describe, expect, it } from 'vitest'
import { DIAGRAM_LIMITS } from './diagrams'
import { parseUi } from './parseUi'

const problems = (source: string) => parseUi(source, { streaming: false }).errors.map((error) => error.message)
const many = (count: number, make: (i: number) => string) => Array.from({ length: count }, (_, i) => make(i)).join(', ')

describe('the diagrams of an answer', () => {
  it('are read without a complaint when they are well written', () => {
    const block = `root = Stack([Hive([[Hex("A")], [Hex("B", "#f97316"), Hex("C", "orange > pink")]], "Title", "Left", "Right"), Chevrons([Chev("One", "text", "blue"), Chev("Two")], "Process"), Cycle([Loop("a"), Loop("b"), Loop("c")], "Centre"), Pyramid([Level("Top", "text"), Level("Base")], "Levels", true), Quadrant([Quad("a"), Quad("b"), Quad("c"), Quad("d", "text", "red")], "x", "y"), Layers([Layer("UI", "React"), Layer("Data")])])`
    expect(problems(block)).toEqual([])
  })

  it('are refused with a colour that is none, in any of their parts', () => {
    for (const part of ['Hive([[Hex("a", "nope")]])', 'Chevrons([Chev("a", null, "url(x)")])', 'Cycle([Loop("a", "zz"), Loop("b"), Loop("c")])', 'Pyramid([Level("a", null, "#12")])', 'Quadrant([Quad("a", null, "bad"), Quad("b"), Quad("c"), Quad("d")])', 'Layers([Layer("a", null, "x y")])']) {
      expect(problems(`root = ${part}`).some((message) => message.includes('is not a colour')), part).toBe(true)
    }
  })

  it('are refused when a cycle has too few steps or a matrix is not four cells', () => {
    expect(problems('root = Cycle([Loop("a"), Loop("b")])').some((message) => message.includes('at least three'))).toBe(true)
    expect(problems('root = Quadrant([Quad("a"), Quad("b")])').some((message) => message.includes('four cells'))).toBe(true)
  })

  it('are refused with too many parts', () => {
    expect(problems(`root = Hive([${many(DIAGRAM_LIMITS.hiveColumns + 1, (i) => `[Hex("h${i}")]`)}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Hive([[${many(DIAGRAM_LIMITS.hexagons + 1, (i) => `Hex("h${i}")`)}]])`).some((message) => message.includes('hexagons'))).toBe(true)
    expect(problems(`root = Chevrons([${many(DIAGRAM_LIMITS.chevrons + 1, (i) => `Chev("c${i}")`)}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Pyramid([${many(DIAGRAM_LIMITS.levels + 1, (i) => `Level("l${i}")`)}])`).some((message) => message.includes('at most'))).toBe(true)
    expect(problems(`root = Layers([${many(DIAGRAM_LIMITS.layers + 1, (i) => `Layer("l${i}")`)}])`).some((message) => message.includes('at most'))).toBe(true)
  })

  it('are refused when a label is far too long', () => {
    expect(problems(`root = Hive([[Hex("${'x'.repeat(DIAGRAM_LIMITS.text + 1)}")]])`).some((message) => message.includes('longer than'))).toBe(true)
  })
})
