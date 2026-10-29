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
	Examples   []string          `json:"examples"`
}

const richUIFence = "```"

const richUIIntro = `## Rich answers

Besides Markdown, the desktop app can draw structured components from a fenced block whose language is seshat-ui. Use one only when it clearly beats plain Markdown: a comparison, a set of figures, a status, a procedure. Keep explanations, reasoning and caveats as normal prose outside the block. At most three blocks per answer, and never a block for a short answer.

Format: one statement per line, name = Component(arguments). Arguments are positional, in the order listed; a name ending in ? is optional, and null skips an optional argument in the middle. Strings use double quotes, lists use [a, b], and a name can be used before it is defined. Write the line root = ... first, then the parts it uses, with the data last. Use only the components and arguments below, never invent one.`

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
