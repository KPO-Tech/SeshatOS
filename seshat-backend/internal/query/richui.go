package query

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
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

const richUIIntro = `## Rich answers

Besides Markdown, the desktop app draws structured components from a fenced block whose language is seshat-ui. Use them for these shapes of content:
- a comparison of several items on several criteria: a Table, never a Markdown table;
- a procedure of three steps or more: Steps;
- key figures: Metric items inside a MetricRow;
- a warning, a caveat or a status the reader must not miss: Callout.
- the architecture of a system, its layers or a data flow: an Architecture of Panels that hold Items with icons, and Flow arrows between them;
- numbers to compare or follow: BarChart, LineChart (a learning curve is one), AreaChart, PieChart; the spread of values: Histogram; a confusion or a correlation matrix: Heatmap; points and a fitted line: ScatterChart, or a Plot with Points;
- a function, its derivative, its integral or the area under it: a Plot of Curves, where op derivative or integral draws them for you, Shade for an area (the legend gives its value) and Dot for a root or an extremum;
- the next steps the reader may want: Choices at the end of the answer, one Choice per follow-up (two to four, each a short phrase); an action the reader can trigger: Button; a file you read or changed: FileRef; a passage taken from a source: Citation; the sources used: SourceList.
Everything else stays normal Markdown outside the block: explanations, reasoning, code and commands, short lists. A short answer needs no block. At most three blocks per answer.

Format: one statement per line, name = Component(arguments). Arguments are positional, in the order listed; a name ending in ? is optional, and null skips an optional argument in the middle. Strings use double quotes, lists use [a, b], and a name can be used before it is defined. Write the line root = ... first, then the parts it uses, with the data last. Use only the components and arguments below, never invent one.

For an Architecture, write each Panel or Item you want to link as its own named statement, and name it in quotes in a Flow: Flow("api", "storage"). Put linked boxes side by side or one above the other, so that an arrow does not cross a third box. Keep a Panel to a handful of Items and the label of a Flow to a few words.

In a Curve the formula is text in x: + - * / ^, sin cos tan exp ln log sqrt abs, pi and e, as 3x^2 or 3*x^2 or (x+1)(x-1). For a mathematics exercise, explain the steps in Markdown outside the block (LaTeX between $ signs works) and draw f, its derivative and the area in Plot blocks, with the roots and extrema as Dots.

An action is written @Ask("message the reader would send you"), @OpenFile("path") or @OpenUrl("https://..."). Use @Ask for a follow-up, worded as the reader would say it, in their language; use only the path of a file you really read, and a real address. Offer Choices only when there is a real fork, never as a habit, and at most once per answer.

Colour marks a concept. Give a tone to what matters (a recommended option, a risk, a total, a status) and leave the rest without one: one or two tones in a table are enough, and a table needs none by default.

For a complex table, ColGroup puts a heading over several columns; Row(cells, tone?, kind?) makes a section row (a title across the whole table), a total row or a repeated heading; Cell(content, tone?, bold?, colspan?, rowspan?, align?) colours, merges or aligns one cell. A cell with a rowspan covers the cell below it, so leave that cell out of the next row.`

var (
	richUIOnce  sync.Once
	richUIBlock string
)

// richAnswersBlock returns the instructions that teach the model the seshat-ui components. It is empty if the embedded catalog
// cannot be read, so a broken file costs the feature, never the turn.
func richAnswersBlock() string {
	richUIOnce.Do(func() {
		var catalog richUICatalog
		if err := json.Unmarshal(richUICatalogJSON, &catalog); err != nil || len(catalog.Components) == 0 {
			return
		}
		var b strings.Builder
		b.WriteString(richUIIntro)
		b.WriteString("\n\nComponents:\n")
		for _, c := range catalog.Components {
			b.WriteString("- " + c.Signature + ": " + c.Description + "\n")
		}
		if len(catalog.Icons.Names) > 0 {
			b.WriteString("\nIcons, for the icon argument: " + strings.Join(catalog.Icons.Names, ", ") + ".\n")
		}
		if len(catalog.Icons.Brands) > 0 {
			b.WriteString("Technology logos, written si: and a name: " + strings.Join(catalog.Icons.Brands, ", ") + ".\n")
		}
		if len(catalog.Tones) > 0 {
			b.WriteString("Tones, for every tone argument: " + strings.Join(catalog.Tones, ", ") + ".\n")
		}
		for i, example := range catalog.Examples {
			if i == 0 {
				b.WriteString("\nExamples:\n")
			}
			b.WriteString("\n" + richUIFence + "seshat-ui\n" + example + "\n" + richUIFence + "\n")
		}
		richUIBlock = strings.TrimRight(b.String(), "\n")
	})
	return richUIBlock
}
