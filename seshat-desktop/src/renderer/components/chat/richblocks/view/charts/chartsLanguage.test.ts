import { describe, expect, it } from 'vitest'
import { parseUi } from '../../lang/parseUi'
import type { UiNode } from '../../lang/types'
import { histogramBins, shadeOf } from '../components/stats'
import { numbers, readPoints, readSeries, withUnit } from './readers'

const full = (src: string) => parseUi(src, { streaming: false })
const layers = (node: UiNode | null) => (node ? (node.props.layers as UiNode[]) : [])

describe('the chart components, as the model writes them', () => {
  it('reads a bar chart with two series and a stacked mode', () => {
    const result = full('root = BarChart(["Q1", "Q2"], [Series("A", [1, 2]), Series("B", [3, 4], "green")], "stacked", "%", false, "Sales")')
    expect(result.errors).toEqual([])
    expect(result.root?.props).toMatchObject({ labels: ['Q1', 'Q2'], mode: 'stacked', unit: '%', horizontal: false, title: 'Sales' })
    expect(readSeries(result.root?.props.series)).toEqual([
      { name: 'A', values: [1, 2], tone: undefined },
      { name: 'B', values: [3, 4], tone: 'green' }
    ])
  })

  it('reads a learning curve', () => {
    const result = full('root = LineChart(["1", "2", "3"], [Series("loss", [0.9, 0.5, 0.3]), Series("val loss", [1, 0.7, 0.6])], null, "Training", "epoch", "loss")')
    expect(result.errors).toEqual([])
    expect(result.root?.props).toMatchObject({ title: 'Training', xLabel: 'epoch', yLabel: 'loss' })
  })

  it('reads a scatter chart with a joined series', () => {
    const result = full('root = ScatterChart([Points("a", [[0, 0], [1, 2]]), Points("b", [[1, 1]], "red", true)], "x", "y")')
    expect(result.errors).toEqual([])
    const points = readPoints(result.root?.props.series)
    expect(points[0].points).toEqual([[0, 0], [1, 2]])
    expect(points[1]).toMatchObject({ tone: 'red', line: true })
  })

  it('reads a plot of a cubic with its derivative, an area and marked points', () => {
    const result = full(`root = Plot([f, d, shade, root1, flat], -3, 3, null, null, "A cubic", "x", "y")
f = Curve("x^3 - 3x + 1", "f(x)")
d = Curve("x^3 - 3x + 1", "f'(x)", "orange", true, "derivative")
shade = Shade("x^3 - 3x + 1", -2, 2, "area")
root1 = Dot(1, -1, "minimum", "red")
flat = HLine(0)`)
    expect(result.errors).toEqual([])
    expect(layers(result.root).map((layer) => layer.name)).toEqual(['Curve', 'Curve', 'Shade', 'Dot', 'HLine'])
    expect(layers(result.root)[1].props).toMatchObject({ expr: 'x^3 - 3x + 1', label: "f'(x)", tone: 'orange', dashed: true, op: 'derivative' })
    expect(result.root?.props).toMatchObject({ xmin: -3, xmax: 3, title: 'A cubic' })
  })

  it('refuses a Plot layer that is not one', () => {
    const result = full('root = Plot([Heading("x", 2)], 0, 1)')
    expect(result.errors[0].code).toBe('wrong-component')
  })

  it('reads a histogram and a confusion matrix', () => {
    const histogram = full('root = Histogram([1, 2, 2, 3, 9], 4, "Residuals", "error")')
    expect(histogram.errors).toEqual([])
    expect(numbers(histogram.root?.props.values)).toEqual([1, 2, 2, 3, 9])

    const heatmap = full('root = Heatmap(["cat", "dog"], ["cat", "dog"], [[50, 2], [5, 43]], "Confusion", "blue", 0)')
    expect(heatmap.errors).toEqual([])
    expect(heatmap.root?.props).toMatchObject({ rows: ['cat', 'dog'], cols: ['cat', 'dog'], tone: 'blue', decimals: 0 })
  })

  it('accepts the arguments by name', () => {
    const result = full('root = Plot(layers=[Curve("x^2")], xmin=-2, xmax=2, title="Parabola")')
    expect(result.errors).toEqual([])
    expect(result.root?.props).toMatchObject({ xmin: -2, xmax: 2, title: 'Parabola' })
  })
})

describe('histogramBins', () => {
  it('counts every value once, the largest in the last bin', () => {
    const bins = histogramBins([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
    expect(bins).toHaveLength(5)
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(11)
    expect(bins[4].count).toBeGreaterThan(0)
    expect(bins[0].from).toBe(0)
    expect(bins[4].to).toBeCloseTo(10)
  })

  it('chooses a number of bins by itself, and copes with one value and with none', () => {
    expect(histogramBins(Array.from({ length: 100 }, (_, i) => i)).length).toBe(8)
    expect(histogramBins([5, 5, 5])).toHaveLength(3)
    expect(histogramBins([])).toEqual([])
    expect(histogramBins([NaN, 1, 2], 2).reduce((sum, bin) => sum + bin.count, 0)).toBe(2)
  })
})

describe('shadeOf', () => {
  it('goes from a pale cell to a strong one', () => {
    expect(shadeOf(0, 0, 10)).toBe(8)
    expect(shadeOf(10, 0, 10)).toBe(70)
    expect(shadeOf(5, 0, 10)).toBe(39)
    expect(shadeOf(NaN, 0, 10)).toBe(0)
    expect(shadeOf(3, 3, 3)).toBe(70)
  })
})

describe('withUnit', () => {
  it('writes a number with its unit', () => {
    expect(withUnit(12, '%')).toBe('12%')
    expect(withUnit(1.23456789, ' ms')).toBe('1.2346 ms')
    expect(withUnit(3, undefined)).toBe('3')
    expect(withUnit(3, 'km')).toBe('3 km')
  })
})
