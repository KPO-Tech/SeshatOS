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
	forms        bool
	design       bool
}

var richUIAllFamilies = richUIFamilies{architecture: true, charts: true, forms: true, design: true}

// The catalog groups that belong to a family; every other group is core.
const (
	richUIArchitectureGroup = "Architecture"
	richUIChartsGroup       = "Charts"
	richUIFormsGroup        = "Forms"
	richUIDesignGroup       = "Design"
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
		"deep learning", "neural", "réseau de neurones", "distribution", "statisti", "x^", "x²", "x³",
		"slider", "curseur", "interactif", "interactive", "parametr", "paramètre", "explor", "illustrat", "visuel", "visual", "figure", "gradient", "descente", "optimi", "convergence", "simulation"},
	[]string{"pie", "roc", "auc", "limite", "limit"},
)

// Words of a request where the reader is to write, answer or fill in something, or to get a text they will edit: an exercise, a quiz, a
// text to correct, an email or a letter to draft.
var richUIFormsWords = richUIWords(
	[]string{"entraîn", "entrain", "exerc", "quiz", "qcm", "practice", "train me", "teach me", "apprend", "rédig", "redig",
		"rédaction", "redaction", "dissertation", "brouillon", "draft", "e-mail", "email", "courriel", "lettre de", "cover letter", "my text", "mon texte",
		"évalue mon", "evaluate my", "flashcard", "révis", "revis", "interroge-moi", "test me", "questionnaire", "formulaire",
		"sondage", "survey", "dictée", "dictee", "mémoris", "memoris", "vocabulaire", "vocabulary", "grammaire", "grammar"},
	[]string{"mail", "mails"},
)

// Words of a request about the look of something: a site, a mockup, a landing page, a palette.
var richUIDesignWords = richUIWords(
	[]string{"maquette", "mockup", "mock-up", "wireframe", "landing", "page d'accueil", "page d’accueil", "homepage", "home page", "site web", "website",
		"web site", "page web", "web page", "charte graphique", "palette", "branding", "design", "prototype", "interface", "couleurs", "colours", "colors",
		"à quoi ressemble", "what would it look like", "look like"},
	[]string{"ui", "ux", "site", "sites"},
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
		forms:        richUIFormsWords.MatchString(text),
		design:       richUIDesignWords.MatchString(text),
	}
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

// How many of the latest messages of a session are read for the families they already used.
const richUIHistoryWindow = 12

func (f richUIFamilies) union(other richUIFamilies) richUIFamilies {
	return richUIFamilies{architecture: f.architecture || other.architecture, charts: f.charts || other.charts, forms: f.forms || other.forms, design: f.design || other.design}
}

var (
	richUIUsesOnce         sync.Once
	richUIUsesArchitecture *regexp.Regexp
	richUIUsesCharts       *regexp.Regexp
	richUIUsesForms        *regexp.Regexp
	richUIUsesDesign       *regexp.Regexp
)

// richUIUsesOf matches a call of any component of the three families, whatever the words of the request were.
func richUIUsesOf() (architecture, charts, forms, design *regexp.Regexp) {
	richUIUsesOnce.Do(func() {
		catalog := richUICatalogLoaded()
		if catalog == nil {
			return
		}
		var archNames, chartNames, formNames, designNames []string
		for _, c := range catalog.Components {
			switch c.Group {
			case richUIArchitectureGroup:
				archNames = append(archNames, regexp.QuoteMeta(c.Name))
			case richUIChartsGroup:
				chartNames = append(chartNames, regexp.QuoteMeta(c.Name))
			case richUIFormsGroup:
				formNames = append(formNames, regexp.QuoteMeta(c.Name))
			case richUIDesignGroup:
				designNames = append(designNames, regexp.QuoteMeta(c.Name))
			}
		}
		compile := func(names []string) *regexp.Regexp {
			if len(names) == 0 {
				return nil
			}
			return regexp.MustCompile(`(?:^|[^A-Za-z])(?:` + strings.Join(names, "|") + `)\(`)
		}
		richUIUsesArchitecture, richUIUsesCharts, richUIUsesForms, richUIUsesDesign = compile(archNames), compile(chartNames), compile(formNames), compile(designNames)
	})
	return richUIUsesArchitecture, richUIUsesCharts, richUIUsesForms, richUIUsesDesign
}

// richUIFamiliesInHistory returns the families that the latest answers of a session already drew. A follow-up that names nothing
// ("and for x squared?", "now the second one") is about what was just shown, so the model keeps what it needs to continue it.
func richUIFamiliesInHistory(messages []types.Message) richUIFamilies {
	arch, charts, forms, design := richUIUsesOf()
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
			found.forms = found.forms || (forms != nil && forms.MatchString(text.Text))
			found.design = found.design || (design != nil && design.MatchString(text.Text))
		}
		if found == richUIAllFamilies {
			break
		}
	}
	return found
}
