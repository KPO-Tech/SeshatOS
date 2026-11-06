import type { Gallery } from './types'

export const MATH: Gallery = {
  id: 'math',
  title: 'Maths lab',
  description: 'Functions to explore: move a slider, and the curve, the marks and the equation follow.',
  tone: 'blue',
  icon: 'chart',
  examples: [
    {
      title: 'The parabola and its vertex',
      about: 'a, h and k move the curve; the vertex follows.',
      code: `root = Card([plot, a, h, k, eq], "Parabola explorer")
plot = Plot([Curve("a*(x-h)^2 + k", "f(x)", "blue"), Dot("h", "k", "vertex", "red"), VLine("h"), HLine("k")], -6, 6, -10, 10, null, "x", "y")
a = Slider("a", -3, 3, 1, 0.1, "a (opening)")
h = Slider("h", -4, 4, 1, 0.1, "h (shift right)")
k = Slider("k", -5, 5, 1, 0.1, "k (shift up)")
eq = Live("$f(x) = {{a}}(x - {{h}})^2 + {{k}}$, vertex ({{h}}, {{k}})")`
    },
    {
      title: 'Sine, cosine and tangent',
      about: 'Choose the function; amplitude and frequency.',
      code: `root = Card([plot, fn, amp, freq, eq], "Trigonometry")
plot = Plot([Curve("a*sin(b*x)", "a sin(bx)", "blue", false, "value", "eq(f, 0)"), Curve("a*cos(b*x)", "a cos(bx)", "green", false, "value", "eq(f, 1)"), Curve("a*tan(b*x)", "a tan(bx)", "orange", false, "value", "eq(f, 2)"), HLine(0)], -7, 7, -4, 4, null, "x", "y")
fn = Select("f", ["sine", "cosine", "tangent"], 0, "Function")
amp = Slider("a", 0.2, 3, 1, 0.1, "Amplitude (a)")
freq = Slider("b", 0.2, 4, 1, 0.1, "Frequency (b)")
eq = Live("Period: {{2*pi/b}}")`
    },
    {
      title: 'The bell curve',
      about: 'Mean and spread, with the area within one sigma.',
      code: `root = Card([plot, a, m, s, eq], "The Gaussian")
plot = Plot([Curve("a*exp(-(x-m)^2/(2*s^2))", "f(x)", "blue"), Shade("a*exp(-(x-m)^2/(2*s^2))", "m-s", "m+s", "within one sigma", "blue"), VLine("m", "mean", "orange")], -6, 6, -0.2, 3, null, "x", "y")
a = Slider("a", 0.5, 3, 1, 0.1, "Height (a)")
m = Slider("m", -3, 3, 0, 0.1, "Mean (m)")
s = Slider("s", 0.4, 2.5, 1, 0.1, "Spread (s)")
eq = Live("The peak is at x = {{m}}; the shaded area runs from {{m-s}} to {{m+s}}.")`
    },
    {
      title: 'A function and its derivative',
      about: 'Two switches: the derivative and an area.',
      code: `root = Card([plot, d, area], "f(x) = x^3 - 3x")
plot = Plot([Curve("x^3 - 3*x", "f(x)", "blue"), Curve("x^3 - 3*x", "f'(x)", "orange", true, "derivative", "show_d"), Shade("x^3 - 3*x", "-sqrt(3)", 0, "area", "green", "show_a"), HLine(0)], -3, 3, -4, 4, null, "x", "y")
d = Toggle("show_d", "Show the derivative", true)
area = Toggle("show_a", "Shade the area", false)`
    },
    {
      title: 'Growth and decay',
      about: 'A start, a rate, and how long to double.',
      code: `root = Card([plot, p, r, eq], "Exponential change")
plot = Plot([Curve("p*(1+r/100)^x", "P(t)", "green"), HLine("p", "start", "orange")], 0, 20, 0, 400, null, "steps", "value")
p = Slider("p", 50, 200, 100, 5, "Start (P)")
r = Slider("r", -10, 15, 5, 1, "Rate (% per step)")
eq = Live("After 10 steps: **{{p*(1+r/100)^10}}**. Doubling takes {{ln(2)/ln(1+r/100)}} steps.")`
    }
  ]
}
