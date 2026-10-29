# 0007 - Charts in chat: data charts, plots of formulas, and charts for machine learning

Status: proposed, 2026-10-29. Builds on [0005](0005-chat-ui-catalog.md).

## Context

The catalog named BarChart, LineChart, AreaChart, PieChart and ScatterChart, and the prompt taught them, but the app drew none.
The need is wider than business charts: a mathematics exercise (a cubic, its derivative, its integral, the area under it, its roots
and extrema) and the charts of machine learning and deep learning (loss and accuracy per epoch, a regression and its data, the
distribution of residuals, a confusion or a correlation matrix, an ROC curve).

A model is bad at computing a curve: it makes algebra and arithmetic mistakes, and a list of a hundred values per curve is a long
answer. It is good at writing a formula and saying what to show. So the client computes and draws; the model describes.

## Decision (proposed)

1. **Our own SVG, no chart library.** Axes, ticks, grid, legend, hover and the shapes are drawn by a small kit in
   `view/charts/`: it takes the colours of the app (the same 12 tones), works in light and dark, is the same at any width, and adds
   no dependency. Chart.js stays for the old `chart` fence only.
2. **Data charts**: `BarChart` (grouped, stacked, horizontal), `LineChart`, `AreaChart` (stacked), `PieChart` (donut),
   `ScatterChart`, with a title and axis labels. A line or an area has a crosshair that shows the values of every series at the
   place under the pointer.
3. **Plots of formulas**: `Plot(layers, xmin, xmax, ymin?, ymax?, title?, xLabel?, yLabel?)` with the layers `Curve`, `Shade`,
   `Dot`, `VLine`, `HLine` and `Points`, drawn on the same axes.
   - A `Curve` is a formula in x written as text. It is read by a small parser that never calls `eval` (`expression.ts`): numbers,
     `x`, `+ - * / ^`, the implied product (`3x^2`, `(x+1)(x-1)`), the usual functions (`sin cos tan asin acos atan sinh cosh tanh
     exp ln log log2 sqrt cbrt abs sign floor ceil round min max`), `pi` and `e`, and the symbols a model writes (`²`, `×`, `√`, `π`).
     A formula that cannot be read is named under the chart, not drawn.
   - `op` on a `Curve` is `value`, `derivative` or `integral`: the client differentiates (a central difference) and integrates (the
     trapezoid rule from xmin, the antiderivative that is zero there), so the derivative and the integral on the chart are right
     even when the model's algebra is not. The model still writes the symbolic result in the text.
   - `Shade` fills the area between a formula and the x axis between two bounds, and the legend gives its value by Simpson's rule
     (the definite integral).
   - The vertical range is automatic: the whole range, padded; or the range of the bulk when a few values run off (an asymptote),
     with the line cut instead of drawn across the gap. `ymin` and `ymax` fix it.
   - The crosshair gives x and the value of every curve there.
4. **Charts for ML and DL**: a learning curve is a `LineChart`; a regression is a `ScatterChart` or a `Plot` with `Points` and a
   `Curve`; an ROC curve is a `Plot` with `Points` joined (`line`) and the diagonal `Curve("x")`; `Histogram(values, bins?, ...)` bins the
   values (Sturges' rule when no number is asked); `Heatmap(rows, cols, values, ...)` shades a grid of numbers by value and writes
   them in the cells (a confusion matrix, a correlation matrix, an attention map).
5. **The prompt** teaches the shapes, the formula syntax, and how to answer an exercise: the steps in Markdown (LaTeX between
   `$` signs already works there) and the graphs in `Plot` blocks, with the roots and extrema as `Dot`.

## Not decided here

- A neural network drawn as layers of nodes, a decision boundary, a 3D surface or a vector field: the Widget layer or a later
  component.
- Parametric and polar curves, implicit curves (a circle), inequalities.
- Symbolic differentiation in the client (the model writes the symbolic form; the client only plots).
- Export of a chart as PNG or SVG, and zoom and pan on a plot.
- Cutting the cost of the prompt, which this record increases: the block grows by about 700 words (about 1000 tokens a turn), so
  loading the detail of a family of components only when it is needed is now worth doing.
