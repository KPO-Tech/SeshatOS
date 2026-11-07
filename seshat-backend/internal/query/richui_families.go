package query

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"sync"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
)

// Two parts of the catalog cost a lot and apply to few requests: the drawings of an architecture (with the icon lists they need) and
// the charts and plots of formulas. They are taught only to a turn whose request is about one; every other turn gets the core.
type richUIFamilies struct {
	architecture bool
	charts       bool
	forms        bool
	design       bool
	diagrams     bool
}

var richUIAllFamilies = richUIFamilies{architecture: true, charts: true, forms: true, design: true, diagrams: true}

// The catalog groups that belong to a family; every other group is core.
const (
	richUIArchitectureGroup = "Architecture"
	richUIChartsGroup       = "Charts"
	richUIFormsGroup        = "Forms"
	richUIDesignGroup       = "Design"
	richUIDiagramsGroup     = "Diagrams"
)

// richFamilyModesProvider is what the preferences offer when the person can force a family on or off.
type richFamilyModesProvider interface {
	RichFamilyModes(ctx context.Context, principal *backendauth.Principal) map[string]string
}

// withModes applies what the person forced: a family set on is taught whatever the request, one set off never, the others stay as the
// request and the conversation made them.
func (f richUIFamilies) withModes(modes map[string]string) richUIFamilies {
	force := func(current bool, mode string) bool {
		switch mode {
		case "on":
			return true
		case "off":
			return false
		}
		return current
	}
	f.architecture = force(f.architecture, modes["architecture"])
	f.charts = force(f.charts, modes["charts"])
	f.forms = force(f.forms, modes["forms"])
	f.design = force(f.design, modes["design"])
	f.diagrams = force(f.diagrams, modes["diagrams"])
	return f
}

var (
	richFamilyWordsOnce  sync.Once
	richFamilyWordsCache map[string]int
)

// RichFamilyWords is what each family of components adds to the prompt, in words: the figure the person sees next to the choice.
func RichFamilyWords() map[string]int {
	richFamilyWordsOnce.Do(func() {
		core := len(strings.Fields(richAnswersBlock(richUIFamilies{})))
		words := func(f richUIFamilies) int { return len(strings.Fields(richAnswersBlock(f))) - core }
		richFamilyWordsCache = map[string]int{
			"architecture": words(richUIFamilies{architecture: true}),
			"charts":       words(richUIFamilies{charts: true}),
			"forms":        words(richUIFamilies{forms: true}),
			"design":       words(richUIFamilies{design: true}),
			"diagrams":     words(richUIFamilies{diagrams: true}),
		}
	})
	out := make(map[string]int, len(richFamilyWordsCache))
	for family, count := range richFamilyWordsCache {
		out[family] = count
	}
	return out
}

func (f richUIFamilies) has(group string) bool {
	switch group {
	case richUIArchitectureGroup:
		return f.architecture
	case richUIChartsGroup:
		return f.charts
	case richUIFormsGroup:
		return f.forms
	case richUIDesignGroup:
		return f.design
	case richUIDiagramsGroup:
		return f.diagrams
	}
	return true
}

var (
	richUICatalogOnce sync.Once
	richUICatalogData *richUICatalog

	richUIBlocksMu sync.Mutex
	richUIBlocks   = map[richUIBlockKey]string{}
)

// richUIBlockKey tells apart the four combinations of families, for the general agent and for the Knowledge agent.
type richUIBlockKey struct {
	families  richUIFamilies
	knowledge bool
}

// The catalog group the Knowledge agent is not taught: it cites through the references of its searches, which the app draws.
const richUISourcesGroup = "Sources"

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
func richAnswersBlock(families richUIFamilies) string { return richBlock(families, false) }

// richKnowledgeAnswersBlock is the same for the Knowledge agent: no source components, only the @Ask action, and the rules that keep
// a component as faithful to the excerpts as a sentence.
func richKnowledgeAnswersBlock(families richUIFamilies) string {
	// The Knowledge agent answers from documents: it asks nothing of the reader in a form.
	families.forms = false
	families.design = false
	families.diagrams = false
	return richBlock(families, true)
}

func richBlock(families richUIFamilies, knowledge bool) string {
	catalog := richUICatalogLoaded()
	if catalog == nil {
		return ""
	}
	richUIBlocksMu.Lock()
	defer richUIBlocksMu.Unlock()
	key := richUIBlockKey{families: families, knowledge: knowledge}
	if block, ok := richUIBlocks[key]; ok {
		return block
	}
	block := buildRichUIBlock(catalog, families, knowledge)
	richUIBlocks[key] = block
	return block
}

func buildRichUIBlock(catalog *richUICatalog, families richUIFamilies, knowledge bool) string {
	var b strings.Builder
	b.WriteString(richUIHead)
	if !knowledge {
		b.WriteString(richUIMediumNote)
	}
	if families.architecture {
		b.WriteString(richUIArchitectureShape)
	}
	if families.charts {
		b.WriteString(richUIChartShapes)
	}
	if families.forms {
		b.WriteString(richUIFormsShape)
	}
	if families.design {
		b.WriteString(richUIDesignShape)
	}
	if families.diagrams {
		b.WriteString(richUIDiagramsShape)
	}
	if knowledge {
		b.WriteString(richUIKnowledgeInteractionShape)
	} else {
		b.WriteString(richUIInteractionShape)
	}
	b.WriteString(richUIFormatNote)
	if families.architecture {
		b.WriteString(richUIArchitectureNote)
	}
	if families.charts {
		b.WriteString(richUIChartNote)
	}
	if families.forms {
		b.WriteString(richUIFormsNote)
	}
	if families.design {
		b.WriteString(richUIDesignNote)
	}
	if families.diagrams {
		b.WriteString(richUIDiagramsNote)
	}
	b.WriteString(richUITextNote)
	if knowledge {
		b.WriteString(richUIKnowledgeActionNote)
	} else {
		b.WriteString(richUIActionNote)
	}
	b.WriteString(richUIStyleNotes)
	if knowledge {
		b.WriteString(richUIKnowledgeRules)
	}
	if families != richUIAllFamilies {
		b.WriteString(richUIOffer)
	}

	b.WriteString("\n\nComponents:\n")
	var left []string
	for _, c := range catalog.Components {
		if families.has(c.Group) && !(knowledge && c.Group == richUISourcesGroup) {
			b.WriteString("- " + forAudience(c.Signature, knowledge) + ": " + c.Description + "\n")
		} else {
			left = append(left, c.Name)
		}
	}
	if families.architecture {
		if len(catalog.Icons.Names) > 0 {
			b.WriteString("\nIcons, for the icon argument: " + strings.Join(catalog.Icons.Names, ", ") + ".\n")
		}
		if len(catalog.Icons.Brands) > 0 {
			b.WriteString("A technology or a service by its plain name (" + strings.Join(catalog.Icons.Brands, ", ") + ", aws lambda, azure, slack, openai, stripe, figma...) draws its logo as an icon when the app has it, and nothing otherwise.\n")
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

// The action of a Button or a Choice is written with its three kinds; the Knowledge agent has only the question.
const richUIAllActions = `@Ask("text")|@OpenFile(path)|@OpenUrl(url)`

func forAudience(signature string, knowledge bool) string {
	if !knowledge {
		return signature
	}
	return strings.ReplaceAll(signature, richUIAllActions, `@Ask("text")`)
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
