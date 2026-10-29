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
	Examples []string `json:"examples"`
}

const richUIFence = "```"

const richUIIntro = `## Rich answers

Besides Markdown, the desktop app draws structured components from a fenced block whose language is seshat-ui. Use them for these shapes of content:
- a comparison of several items on several criteria: a Table, never a Markdown table;
- a procedure of three steps or more: Steps;
- key figures: Metric items inside a MetricRow;
- a warning, a caveat or a status the reader must not miss: Callout.
- the architecture of a system, its layers or a data flow: an Architecture of Panels that hold Items with icons, and Flow arrows between them.
Everything else stays normal Markdown outside the block: explanations, reasoning, code and commands, short lists. A short answer needs no block. At most three blocks per answer.

Format: one statement per line, name = Component(arguments). Arguments are positional, in the order listed; a name ending in ? is optional, and null skips an optional argument in the middle. Strings use double quotes, lists use [a, b], and a name can be used before it is defined. Write the line root = ... first, then the parts it uses, with the data last. Use only the components and arguments below, never invent one.

For an Architecture, write each Panel or Item you want to link as its own named statement, and name it in quotes in a Flow: Flow("api", "storage"). Put linked boxes side by side or one above the other, so that an arrow does not cross a third box. Keep a Panel to a handful of Items.`

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
