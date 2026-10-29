package query

import (
	_ "embed"
)

// richui_catalog.spec.json is written by the desktop (npm run ui-catalog) from the catalog of components it can draw, so
// the model is only taught what the app can show. A test in the desktop fails when the file is out of date.
//
//go:embed richui_catalog.spec.json
var richUICatalogJSON []byte

type richUIComponent struct {
	Name        string `json:"name"`
	Group       string `json:"group"`
	Signature   string `json:"signature"`
	Description string `json:"description"`
}

type richUICatalog struct {
	Components []richUIComponent `json:"components"`
	Icons      struct {
		Names  []string `json:"names"`
		Brands []string `json:"brands"`
	} `json:"icons"`
	Tones    []string `json:"tones"`
	Examples []string `json:"examples"`
}

const richUIFence = "```"

const (
	richUIHead = `## Rich answers

Besides Markdown, the desktop app draws structured components from a fenced block whose language is seshat-ui. Use them for these shapes of content:
- a comparison of several items on several criteria: a Table, never a Markdown table;
- a procedure of three steps or more: Steps;
- key figures: Metric items inside a MetricRow;
- a warning, a caveat or a status the reader must not miss: Callout.
`
	richUIArchitectureShape = `- the architecture of a system, its layers or a data flow: an Architecture of Panels that hold Items with icons, and Flow arrows between them;
`
	richUIChartShapes = `- numbers to compare or follow: BarChart, LineChart (a learning curve is one), AreaChart, PieChart; the spread of values: Histogram; a confusion or a correlation matrix: Heatmap; points and a fitted line: ScatterChart, or a Plot with Points;
- a function, its derivative, its integral or the area under it: a Plot of Curves, where op derivative or integral draws them for you, Shade for an area (the legend gives its value) and Dot for a root or an extremum;
`
	richUIInteractionShape = `- the next steps the reader may want: Choices at the end of the answer, one Choice per follow-up (two to four, each a short phrase); an action the reader can trigger: Button; a file you read or changed: FileRef; a passage taken from a source: Citation; the sources used: SourceList.
`
	// What the Knowledge agent may use of the same: its sources are drawn by the app from the references it cites.
	richUIKnowledgeInteractionShape = `- the next questions the reader may want: Choices at the end of the answer, one Choice per follow-up (two to four, each a short phrase); an action the reader can trigger: Button.
`
	richUIFormatNote = `Everything else stays normal Markdown outside the block: explanations, reasoning, code and commands, short lists. A short answer needs no block. At most three blocks per answer.

Format: one statement per line, name = Component(arguments). Arguments are positional, in the order listed; a name ending in ? is optional, and null skips an optional argument in the middle. Strings use double quotes, lists use [a, b], and a name can be used before it is defined. Write the line root = ... first, then the parts it uses, with the data last. Use only the components and arguments below, never invent one.

`

	richUIArchitectureNote = `For an Architecture, write each Panel or Item you want to link as its own named statement, and name it in quotes in a Flow: Flow("api", "storage"). Put linked boxes side by side or one above the other, so that an arrow does not cross a third box. Keep a Panel to a handful of Items and the label of a Flow to a few words.

`
	richUIChartNote = `In a Curve the formula is text in x: + - * / ^, sin cos tan exp ln log sqrt abs, pi and e, as 3x^2 or 3*x^2 or (x+1)(x-1). For a mathematics exercise, explain the steps in Markdown outside the block (LaTeX between $ signs works) and draw f, its derivative and the area in Plot blocks, with the roots and extrema as Dots.

`
	richUITextNote = `The text of a component is Markdown: bold, italics, lists, links and code fences are drawn. Use a Card or a Callout only for what must stand apart or carry a colour; never put code, an ordinary paragraph or a list in a Card or a Markdown component when normal Markdown outside the block says it as well.

`
	richUIActionNote = `An action is written @Ask("message the reader would send you"), @OpenFile("path") or @OpenUrl("https://..."). Use @Ask for a follow-up, worded as the reader would say it, in their language; use only the path of a file you really read, and a real address. Offer Choices only when there is a real fork, never as a habit, and at most once per answer.

`
	richUIKnowledgeActionNote = `An action is written @Ask("question the reader would send you"). Use it for a follow-up about the documents, worded as the reader would say it, in their language. Offer Choices only when there is a real fork, never as a habit, and at most once per answer.

`
	richUIStyleNotes = `Colour marks a concept. Give a tone to what matters (a recommended option, a risk, a total, a status) and leave the rest without one: one or two tones in a table are enough, and a table needs none by default.

For a complex table, ColGroup puts a heading over several columns; Row(cells, tone?, kind?) makes a section row (a title across the whole table), a total row or a repeated heading; Cell(content, tone?, bold?, colspan?, rowspan?, align?) colours, merges or aligns one cell. A cell with a rowspan covers the cell below it, so leave that cell out of the next row.`

	// The rules that keep a component as faithful as a sentence, for the agent that answers from documents.
	richUIKnowledgeRules = `

In these components everything comes from the excerpts, exactly as in a sentence: never a figure, a date or a name that no excerpt gives. Cite as in a paragraph: write the reference in square brackets, as [k7f3a91], after the text it supports, in a table cell, a Markdown component, a Callout body or a Step body; never in a title, a label, a value or a chart. A chart only for figures that the excerpts give; with only a few figures, a table or a sentence says it better. A component is for what it makes easier to read (a comparison, steps, key figures); a short answer is a sentence.`

	// Told when a family is left out, so that the model can still offer it: the reader's reply carries the word that loads it.
	richUIOffer = "\n\nMore components exist for architecture drawings, and for charts and plots of formulas; they are described here when the request is about a diagram, a chart or a graph. When one would clearly help and was not asked for, offer it as a Choice whose @Ask text names it, as in Show it as a chart."
)
