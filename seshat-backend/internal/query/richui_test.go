package query

import (
	"context"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat-runtime/pkg/types"
)

type fakePreferences struct{ richAnswers bool }

func (fakePreferences) BuildSystemPromptBlock(context.Context, *backendauth.Principal) (string, error) {
	return "", nil
}

func (fakePreferences) ResolvePermissionModes(context.Context, *backendauth.Principal, types.ExecutionOrigin) (types.PermissionMode, error) {
	return types.PermissionModeOnRequest, nil
}

func (fakePreferences) MemoryEnabled(context.Context, *backendauth.Principal) bool { return false }

func (f fakePreferences) RichAnswersEnabled(context.Context, *backendauth.Principal) bool {
	return f.richAnswers
}

func appendedPrompt(t *testing.T, svc *Service) string {
	t.Helper()
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{Prompt: "compare these two tools"})
	if input.AppendSystemPrompt == nil {
		return ""
	}
	return *input.AppendSystemPrompt
}

func TestRichAnswersBlockTeachesTheCatalogItWasGenerated(t *testing.T) {
	block := richAnswersBlock(richUIAllFamilies)
	if block == "" {
		t.Fatal("the embedded catalog must produce a block")
	}
	for _, want := range []string{"seshat-ui", "root = ", "Table(", "Metric(", "Callout(", "Steps(", "Examples:", "never a Markdown table", "three steps or more", "a few words", "Plot(", "Curve(", "Histogram(", "Heatmap(", "Choices(", "@Ask(", "Architecture(", "Icons, for the icon argument", "text of a component is Markdown"} {
		if !strings.Contains(block, want) {
			t.Errorf("the block must mention %q", want)
		}
	}
	if strings.Contains(block, "More components exist") {
		t.Error("nothing is left out of the full block, so nothing is offered")
	}
	// A family is paid for only by the requests that ask for it, so the budget is per family: what each adds to the core. A family that
	// grows past its figure should be a deliberate choice, and the full block is the sum of them.
	core := len(strings.Fields(richAnswersBlock(richUIFamilies{})))
	budgets := map[string]struct {
		families richUIFamilies
		words    int
	}{
		"architecture": {richUIFamilies{architecture: true}, 600},
		"charts":       {richUIFamilies{charts: true}, 1150},
		"forms":        {richUIFamilies{forms: true}, 1000},
		"design":       {richUIFamilies{design: true}, 850},
		"diagrams":     {richUIFamilies{diagrams: true}, 600},
	}
	for name, budget := range budgets {
		if added := len(strings.Fields(richAnswersBlock(budget.families))) - core; added > budget.words {
			t.Errorf("the %s family adds %d words to the core, keep it under %d", name, added, budget.words)
		}
	}
}

func TestRichAnswersCoreLeavesOutTheFamilies(t *testing.T) {
	core := richAnswersBlock(richUIFamilies{})
	for _, want := range []string{"seshat-ui", "Table(", "Steps(", "Choices(", "@Ask(", "Examples:", "More components exist"} {
		if !strings.Contains(core, want) {
			t.Errorf("the core must mention %q", want)
		}
	}
	for _, unwanted := range []string{"Architecture(", "Panel(", "Plot(", "Curve(", "BarChart(", "Heatmap(", "Icons, for the icon argument", "Technology logos"} {
		if strings.Contains(core, unwanted) {
			t.Errorf("the core must not mention %q", unwanted)
		}
	}
	// Most turns pay for the core, so it is the figure to keep small.
	words := len(strings.Fields(core))
	if words > 1200 {
		t.Errorf("the core is %d words long, keep it under 1200", words)
	}
	if full := len(strings.Fields(richAnswersBlock(richUIAllFamilies))); words > full*6/10 {
		t.Errorf("the core (%d words) should be well under the full block (%d)", words, full)
	}
}

func TestRichAnswersFamiliesAreTaughtOnlyWhenAsked(t *testing.T) {
	architecture := richAnswersBlock(richUIFamilies{architecture: true})
	if !strings.Contains(architecture, "Architecture(") || strings.Contains(architecture, "Plot(") {
		t.Error("the architecture family brings the drawings and not the plots")
	}
	charts := richAnswersBlock(richUIFamilies{charts: true})
	if !strings.Contains(charts, "Plot(") || !strings.Contains(charts, "formula is text in x") || strings.Contains(charts, "Architecture(") {
		t.Error("the charts family brings the plots and not the drawings")
	}
	// An example that draws a component left out is left out with it, and no other.
	if strings.Contains(richAnswersBlock(richUIFamilies{}), "Flow(") || !strings.Contains(richAnswersBlock(richUIFamilies{}), "```seshat-ui") {
		t.Error("the core keeps the examples that need nothing left out, and only those")
	}
}

func TestRichUIFamiliesFor(t *testing.T) {
	cases := []struct {
		prompt       string
		architecture bool
		charts       bool
	}{
		{"compare these two tools", false, false},
		{"Explique-moi la différence entre SQLite et DuckDB", false, false},
		{"fais un schéma de l'architecture de mon application", true, false},
		{"draw a diagram of the data flow", true, true},
		{"trace la courbe d'apprentissage de ce modèle", false, true},
		{"Calcule la dérivée de f(x) = x^3 - 3x + 1", false, true},
		{"montre la matrice de confusion", false, true},
		{"what is the ROC curve", false, true},
		{"explain the process of photosynthesis", false, false},
		{"help me with a pie chart", false, true},
		{"please process the list", false, false},
		{"Show it as a chart", false, true},
		{"expliques moi la descente de gradient avec des illustrations visuelles", false, true},
		{"explain gradient descent with visual figures", false, true},
	}
	for _, c := range cases {
		got := richUIFamiliesFor(c.prompt)
		if got.architecture != c.architecture || got.charts != c.charts {
			t.Errorf("%q: got architecture=%v charts=%v, want architecture=%v charts=%v", c.prompt, got.architecture, got.charts, c.architecture, c.charts)
		}
	}
}

func TestBuildContextInput_RichAnswersFollowThePreference(t *testing.T) {
	on := appendedPrompt(t, &Service{preferences: fakePreferences{richAnswers: true}})
	if !strings.Contains(on, "## Rich answers") {
		t.Fatal("rich answers must be taught when the preference is on")
	}
	off := appendedPrompt(t, &Service{preferences: fakePreferences{richAnswers: false}})
	if strings.Contains(off, "## Rich answers") || strings.Contains(off, "seshat-ui") {
		t.Fatal("rich answers must not be taught when the user turned them off")
	}
	if !strings.Contains(off, "Narrate as you work") {
		t.Fatal("turning rich answers off must leave the other blocks alone")
	}
}

func TestBuildContextInput_RichAnswersAreOnWithoutPreferences(t *testing.T) {
	if !strings.Contains(appendedPrompt(t, &Service{}), "## Rich answers") {
		t.Fatal("the feature is on by default")
	}
}

func richUIMessage(role types.Role, text string) types.Message {
	return types.Message{Role: role, Content: []types.ContentBlock{types.TextContent{Text: text}}}
}

func TestRichUIFamiliesInHistory(t *testing.T) {
	plot := richUIMessage(types.RoleAssistant, "Here it is.\n```seshat-ui\nroot = Plot([c], -3, 3)\nc = Curve(\"x^3\")\n```")
	drawing := richUIMessage(types.RoleAssistant, "```seshat-ui\nroot = Architecture([p], [])\np = Panel([], \"Core\")\n```")
	table := richUIMessage(types.RoleAssistant, "```seshat-ui\nroot = Table([Col(\"A\")], [[\"1\"]])\n```")
	asked := richUIMessage(types.RoleUser, "```seshat-ui\nroot = Plot([], 0, 1)\n```")

	if got := richUIFamiliesInHistory([]types.Message{plot}); got != (richUIFamilies{charts: true}) {
		t.Errorf("a plot brings the charts family back, got %+v", got)
	}
	if got := richUIFamiliesInHistory([]types.Message{drawing, table}); got != (richUIFamilies{architecture: true}) {
		t.Errorf("a drawing brings the architecture family back, got %+v", got)
	}
	if got := richUIFamiliesInHistory([]types.Message{table}); got != (richUIFamilies{}) {
		t.Errorf("a table needs no family, got %+v", got)
	}
	if got := richUIFamiliesInHistory([]types.Message{asked}); got != (richUIFamilies{}) {
		t.Errorf("only what the assistant drew counts, got %+v", got)
	}
	if got := richUIFamiliesInHistory([]types.Message{plot, drawing}); got != (richUIFamilies{architecture: true, charts: true}) {
		t.Errorf("both families are found, got %+v", got)
	}
	exercise := richUIMessage(types.RoleAssistant, "```seshat-ui\nroot = Form([TextArea(\"a\")], Submit(\"Send\", \"{{a}}\"))\n```")
	if got := richUIFamiliesInHistory([]types.Message{exercise}); got != (richUIFamilies{forms: true}) {
		t.Errorf("a form brings the forms family back, so that its answer can be corrected, got %+v", got)
	}

	old := []types.Message{plot}
	for i := 0; i < richUIHistoryWindow; i++ {
		old = append(old, richUIMessage(types.RoleUser, "and the next one?"))
	}
	if got := richUIFamiliesInHistory(old); got != (richUIFamilies{}) {
		t.Errorf("a plot older than the window is forgotten, got %+v", got)
	}
}

func TestRichUIFamiliesInText(t *testing.T) {
	// Words in a Markdown explanation are not a call: only a seshat-ui block counts.
	prose := richUIMessage(types.RoleAssistant, "The Plot( function is described above, and an Architecture( too.")
	if got := richUIFamiliesInHistory([]types.Message{prose}); got != (richUIFamilies{}) {
		t.Errorf("prose is not a block, got %+v", got)
	}
}

func TestRichUIFormsAreTaughtForExercisesAndDrafts(t *testing.T) {
	for _, prompt := range []string{"entraîne-moi à la rédaction en anglais", "aide-moi à écrire un mail de démission", "give me a quiz on Go", "help me write a cover letter"} {
		if !richUIFamiliesFor(prompt).forms {
			t.Errorf("%q should bring the forms family", prompt)
		}
	}
	for _, prompt := range []string{"explique les goroutines", "what is the capital of France"} {
		if richUIFamiliesFor(prompt).forms {
			t.Errorf("%q should not bring the forms family", prompt)
		}
	}
	block := richAnswersBlock(richUIFamilies{forms: true})
	for _, want := range []string{"Form(", "Submit(", "TextArea(", "Draft("} {
		if !strings.Contains(block, want) {
			t.Errorf("the forms block must mention %q", want)
		}
	}
	if strings.Contains(richAnswersBlock(richUIFamilies{}), "TextArea(") {
		t.Error("the core must not teach forms")
	}
	if strings.Contains(richKnowledgeAnswersBlock(richUIAllFamilies), "TextArea(") {
		t.Error("the Knowledge agent must not be taught forms")
	}
}

func TestRichUISlidersAreTaughtWithTheCharts(t *testing.T) {
	for _, prompt := range []string{"fais-moi un graphique interactif du sinus avec des curseurs", "let me explore a parabola with sliders"} {
		if !richUIFamiliesFor(prompt).charts {
			t.Errorf("%q should bring the charts family", prompt)
		}
	}
	block := richAnswersBlock(richUIFamilies{charts: true})
	for _, want := range []string{"Slider(", "Live(", "a*sin(b*x + c) + d"} {
		if !strings.Contains(block, want) {
			t.Errorf("the charts block must mention %q", want)
		}
	}
	if strings.Contains(richAnswersBlock(richUIFamilies{}), "Slider(") {
		t.Error("the core must not teach sliders")
	}
}

func TestRichUIQuizzesAreTaughtWithTheForms(t *testing.T) {
	block := richAnswersBlock(richUIFamilies{forms: true})
	for _, want := range []string{"Quiz(", "Question(", "Flashcards(", "Flash(", "{{missed}}"} {
		if !strings.Contains(block, want) {
			t.Errorf("the forms block must mention %q", want)
		}
	}
	charts := richAnswersBlock(richUIFamilies{charts: true})
	for _, want := range []string{"Toggle(", "Select(", "eq(name, 1)"} {
		if !strings.Contains(charts, want) {
			t.Errorf("the charts block must mention %q", want)
		}
	}
	quiz := richUIMessage(types.RoleAssistant, "```seshat-ui\nroot = Quiz([Question(\"q\", [\"a\", \"b\"], 0)])\n```")
	if got := richUIFamiliesInHistory([]types.Message{quiz}); !got.forms {
		t.Errorf("a quiz brings the forms family back, got %+v", got)
	}
}

func TestRichUIDesignIsTaughtForSketchesOfASite(t *testing.T) {
	for _, prompt := range []string{"montre-moi à quoi pourrait ressembler mon site", "fais une maquette de landing page pour mon app", "sketch a homepage for a bakery", "propose-moi une palette de couleurs"} {
		if !richUIFamiliesFor(prompt).design {
			t.Errorf("%q should bring the design family", prompt)
		}
	}
	for _, prompt := range []string{"explique les goroutines", "trace sin et cos"} {
		if richUIFamiliesFor(prompt).design {
			t.Errorf("%q should not bring the design family", prompt)
		}
	}
	block := richAnswersBlock(richUIFamilies{design: true})
	for _, want := range []string{"Browser(", "Hero(", "Features(", "Palette(", "hex codes"} {
		if !strings.Contains(block, want) {
			t.Errorf("the design block must mention %q", want)
		}
	}
	if strings.Contains(richAnswersBlock(richUIFamilies{}), "Browser(") {
		t.Error("the core must not teach design pieces")
	}
	if strings.Contains(richKnowledgeAnswersBlock(richUIAllFamilies), "Browser(") {
		t.Error("the Knowledge agent must not be taught design pieces")
	}
	sketch := richUIMessage(types.RoleAssistant, "```seshat-ui\nroot = Browser([Hero(\"T\")])\n```")
	if got := richUIFamiliesInHistory([]types.Message{sketch}); !got.design {
		t.Errorf("a sketch brings the design family back, got %+v", got)
	}
}

// fakeForcedFamilies is a preferences provider where the person forced some families on or off.
type fakeForcedFamilies struct {
	fakePreferences
	modes map[string]string
}

func (f fakeForcedFamilies) RichFamilyModes(context.Context, *backendauth.Principal) map[string]string {
	return f.modes
}

func promptFor(t *testing.T, prompt string, modes map[string]string) string {
	t.Helper()
	svc := &Service{preferences: fakeForcedFamilies{fakePreferences{richAnswers: true}, modes}}
	input, _ := svc.BuildContextInput(context.Background(), ContextBuildParams{Prompt: prompt, Principal: &backendauth.Principal{}})
	if input.AppendSystemPrompt == nil {
		return ""
	}
	return *input.AppendSystemPrompt
}

func TestAFamilyForcedOnIsTaughtWhateverTheRequest(t *testing.T) {
	plain := "compare these two tools"
	if strings.Contains(promptFor(t, plain, nil), "Quiz(") {
		t.Fatal("without a choice, a plain request is not taught the forms")
	}
	if !strings.Contains(promptFor(t, plain, map[string]string{"forms": "on"}), "Quiz(") {
		t.Error("forms forced on must be taught to a plain request")
	}
	if !strings.Contains(promptFor(t, plain, map[string]string{"design": "on"}), "Browser(") {
		t.Error("design forced on must be taught to a plain request")
	}
}

func TestAFamilyForcedOffIsNeverTaught(t *testing.T) {
	quiz := "make me a quiz of five questions on Go"
	if !strings.Contains(promptFor(t, quiz, nil), "Quiz(") {
		t.Fatal("automatic: a request for a quiz is taught the forms")
	}
	if strings.Contains(promptFor(t, quiz, map[string]string{"forms": "off"}), "Quiz(") {
		t.Error("forms forced off must not be taught, whatever the request")
	}
	if !strings.Contains(promptFor(t, quiz, map[string]string{"charts": "off"}), "Quiz(") {
		t.Error("forcing another family off must leave the forms alone")
	}
}

func TestFamilyWordsAreWhatEachFamilyAddsToThePrompt(t *testing.T) {
	words := RichFamilyWords()
	for _, family := range []string{"architecture", "charts", "forms", "design"} {
		if words[family] < 100 {
			t.Errorf("the %s family should add more than a hundred words, got %d", family, words[family])
		}
	}
	words["forms"] = 0
	if RichFamilyWords()["forms"] == 0 {
		t.Error("the figures given out must be a copy")
	}
}

func TestRichUIDiagramsAreTaughtForShapesOfAnIdea(t *testing.T) {
	for _, prompt := range []string{"fais un schéma en nid d'abeille de mon projet", "draw a pyramid of the needs", "montre un entonnoir de conversion", "make a 2x2 matrix of effort and impact", "un diagramme de Venn"} {
		if !richUIFamiliesFor(prompt).diagrams {
			t.Errorf("%q should bring the diagrams family", prompt)
		}
	}
	for _, prompt := range []string{"explique les goroutines", "process this file", "trace sin et cos", "what is the confusion matrix of my model"} {
		if richUIFamiliesFor(prompt).diagrams {
			t.Errorf("%q should not bring the diagrams family", prompt)
		}
	}
	block := richAnswersBlock(richUIFamilies{diagrams: true})
	for _, want := range []string{"Hive(", "Hex(", "Chevrons(", "Cycle(", "Pyramid(", "Quadrant(", "Layers("} {
		if !strings.Contains(block, want) {
			t.Errorf("the diagrams block must mention %q", want)
		}
	}
	if strings.Contains(richAnswersBlock(richUIFamilies{}), "Hive(") {
		t.Error("the core must not teach diagrams")
	}
	if strings.Contains(richKnowledgeAnswersBlock(richUIAllFamilies), "Hive(") {
		t.Error("the Knowledge agent must not be taught diagrams")
	}
	hive := richUIMessage(types.RoleAssistant, "```seshat-ui\nroot = Hive([[a]])\na = Hex(\"x\")\n```")
	if got := richUIFamiliesInHistory([]types.Message{hive}); !got.diagrams {
		t.Errorf("a honeycomb brings the diagrams family back, got %+v", got)
	}
}
