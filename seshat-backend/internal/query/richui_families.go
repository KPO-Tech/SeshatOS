package query

import (
	"encoding/json"
	"regexp"
	"strings"
	"sync"

	"github.com/KPO-Tech/seshat-runtime/pkg/types"
)

// Two parts of the catalog cost a lot and apply to few requests: the drawings of an architecture (with the icon lists they need) and
// the charts and plots of formulas. They are taught only to a turn whose request is about one; every other turn gets the core.
type richUIFamilies struct {
	architecture bool
	charts       bool
}

var richUIAllFamilies = richUIFamilies{architecture: true, charts: true}

// The catalog groups that belong to a family; every other group is core.
const (
	richUIArchitectureGroup = "Architecture"
	richUIChartsGroup       = "Charts"
)

// A request is matched on its lower-cased text. A stem must start a word (so "trace" does not match "embrace"); an exact word must
// be the whole word (so "roc" does not match "process").
func richUIWords(stems, exact []string) *regexp.Regexp {
	quote := func(words []string) string {
		quoted := make([]string, len(words))
		for i, word := range words {
			quoted[i] = regexp.QuoteMeta(word)
		}
		return strings.Join(quoted, "|")
	}
	return regexp.MustCompile(`(?:^|[^\p{L}\p{N}])(?:(?:` + quote(stems) + `)|(?:` + quote(exact) + `)(?:$|[^\p{L}\p{N}]))`)
}

// Words of a request that ask for a drawing of a system.
var richUIArchitectureWords = richUIWords(
	[]string{"architecture", "schema", "schéma", "diagram", "flowchart", "organigramme", "infrastructure", "topolog", "data flow",
		"flux de donn", "system design", "conception du syst", "composants du syst", "dessin", "dessine", "draw"},
	[]string{"uml"},
)

// Words of a request about numbers, curves or mathematics.
var richUIChartWords = richUIWords(
	[]string{"graph", "chart", "courbe", "curve", "plot", "trac", "histogram", "heatmap", "carte de chaleur", "confusion", "correlation",
		"corrélation", "scatter", "nuage de points", "camembert", "barres", "visualis", "dessin", "dessine", "draw", "deriv", "dériv",
		"integral", "intégral", "primitive", "fonction", "function", "equation", "équation", "asymptote", "extremum", "extrema",
		"racine", "regression", "régression", "loss", "accuracy", "learning curve", "apprentissage", "overfit", "machine learning",
		"deep learning", "neural", "réseau de neurones", "distribution", "statisti", "x^", "x²", "x³"},
	[]string{"pie", "roc", "auc", "limite", "limit"},
)

var richUIFormula = regexp.MustCompile(`\b[fgh]\s*\(\s*x\s*\)|\bx\s*\^\s*\d|\b[a-z]\s*=\s*\d*x\s*[+\-^]`)

// richUIFamiliesFor decides what a request needs. The prompt is built again for every turn, so a follow-up that names nothing
// ("and the second one?") falls back to the core; a word such as chart or diagram, in the reader's own reply to a Choice, brings
// the family back.
func richUIFamiliesFor(prompt string) richUIFamilies {
	text := strings.ToLower(prompt)
	return richUIFamilies{
		architecture: richUIArchitectureWords.MatchString(text),
		charts:       richUIChartWords.MatchString(text) || richUIFormula.MatchString(text),
	}
}

func (f richUIFamilies) has(group string) bool {
	switch group {
	case richUIArchitectureGroup:
		return f.architecture
	case richUIChartsGroup:
		return f.charts
	}
	return true
}

var (
	richUICatalogOnce sync.Once
	richUICatalogData *richUICatalog

	richUIBlocksMu sync.Mutex
	richUIBlocks   = map[richUIFamilies]string{}
)

func richUICatalogLoaded() *richUICatalog {
	richUICatalogOnce.Do(func() {
		var catalog richUICatalog
		if err := json.Unmarshal(richUICatalogJSON, &catalog); err != nil || len(catalog.Components) == 0 {
			return
		}
		richUICatalogData = &catalog
	})
	return richUICatalogData
}

// richAnswersBlock returns the instructions that teach the model the seshat-ui components that the families ask for. It is empty
// if the embedded catalog cannot be read, so a broken file costs the feature, never the turn.
func richAnswersBlock(families richUIFamilies) string {
	catalog := richUICatalogLoaded()
	if catalog == nil {
		return ""
	}
	richUIBlocksMu.Lock()
	defer richUIBlocksMu.Unlock()
	if block, ok := richUIBlocks[families]; ok {
		return block
	}
	block := buildRichUIBlock(catalog, families)
	richUIBlocks[families] = block
	return block
}

func buildRichUIBlock(catalog *richUICatalog, families richUIFamilies) string {
	var b strings.Builder
	b.WriteString(richUIHead)
	if families.architecture {
		b.WriteString(richUIArchitectureShape)
	}
	if families.charts {
		b.WriteString(richUIChartShapes)
	}
	b.WriteString(richUIInteractionShape)
	if families.architecture {
		b.WriteString(richUIArchitectureNote)
	}
	if families.charts {
		b.WriteString(richUIChartNote)
	}
	b.WriteString(richUICoreNotes)
	if families != richUIAllFamilies {
		b.WriteString(richUIOffer)
	}

	b.WriteString("\n\nComponents:\n")
	var left []string
	for _, c := range catalog.Components {
		if families.has(c.Group) {
			b.WriteString("- " + c.Signature + ": " + c.Description + "\n")
		} else {
			left = append(left, c.Name)
		}
	}
	if families.architecture {
		if len(catalog.Icons.Names) > 0 {
			b.WriteString("\nIcons, for the icon argument: " + strings.Join(catalog.Icons.Names, ", ") + ".\n")
		}
		if len(catalog.Icons.Brands) > 0 {
			b.WriteString("Technology logos, written si: and a name: " + strings.Join(catalog.Icons.Brands, ", ") + ".\n")
		}
	}
	if len(catalog.Tones) > 0 {
		b.WriteString("Tones, for every tone argument: " + strings.Join(catalog.Tones, ", ") + ".\n")
	}

	first := true
	for _, example := range catalog.Examples {
		if usesAny(example, left) {
			continue
		}
		if first {
			b.WriteString("\nExamples:\n")
			first = false
		}
		b.WriteString("\n" + richUIFence + "seshat-ui\n" + example + "\n" + richUIFence + "\n")
	}
	return strings.TrimRight(b.String(), "\n")
}

// usesAny reports whether the example draws one of the components that were left out. A name is a whole identifier, so Item is
// not found in CheckItem.
func usesAny(example string, names []string) bool {
	for _, name := range names {
		if regexp.MustCompile(`(?:^|[^A-Za-z])` + name + `\(`).MatchString(example) {
			return true
		}
	}
	return false
}

// How many of the latest messages of a session are read for the families they already used.
const richUIHistoryWindow = 12

func (f richUIFamilies) union(other richUIFamilies) richUIFamilies {
	return richUIFamilies{architecture: f.architecture || other.architecture, charts: f.charts || other.charts}
}

var (
	richUIUsesOnce         sync.Once
	richUIUsesArchitecture *regexp.Regexp
	richUIUsesCharts       *regexp.Regexp
)

// richUIUsesOf matches a call of any component of the two families, whatever the words of the request were.
func richUIUsesOf() (architecture, charts *regexp.Regexp) {
	richUIUsesOnce.Do(func() {
		catalog := richUICatalogLoaded()
		if catalog == nil {
			return
		}
		var archNames, chartNames []string
		for _, c := range catalog.Components {
			switch c.Group {
			case richUIArchitectureGroup:
				archNames = append(archNames, regexp.QuoteMeta(c.Name))
			case richUIChartsGroup:
				chartNames = append(chartNames, regexp.QuoteMeta(c.Name))
			}
		}
		compile := func(names []string) *regexp.Regexp {
			if len(names) == 0 {
				return nil
			}
			return regexp.MustCompile(`(?:^|[^A-Za-z])(?:` + strings.Join(names, "|") + `)\(`)
		}
		richUIUsesArchitecture, richUIUsesCharts = compile(archNames), compile(chartNames)
	})
	return richUIUsesArchitecture, richUIUsesCharts
}

// richUIFamiliesInHistory returns the families that the latest answers of a session already drew. A follow-up that names nothing
// ("and for x squared?", "now the second one") is about what was just shown, so the model keeps what it needs to continue it.
func richUIFamiliesInHistory(messages []types.Message) richUIFamilies {
	arch, charts := richUIUsesOf()
	var found richUIFamilies
	read := 0
	for i := len(messages) - 1; i >= 0 && read < richUIHistoryWindow; i-- {
		read++
		if messages[i].Role != types.RoleAssistant {
			continue
		}
		for _, block := range messages[i].Content {
			text, ok := block.(types.TextContent)
			if !ok || !strings.Contains(text.Text, richUIFence+"seshat-ui") {
				continue
			}
			found.architecture = found.architecture || (arch != nil && arch.MatchString(text.Text))
			found.charts = found.charts || (charts != nil && charts.MatchString(text.Text))
		}
		if found == richUIAllFamilies {
			break
		}
	}
	return found
}
