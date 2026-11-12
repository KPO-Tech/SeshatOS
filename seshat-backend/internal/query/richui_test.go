package query

import (
	"context"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat-runtime/pkg/types"
)

type fakePreferences struct{ richAnswers, naturalWriting bool }

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

func (f fakePreferences) NaturalWritingEnabled(context.Context, *backendauth.Principal) bool {
	return f.naturalWriting
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
		"charts":       {richUIFamilies{charts: true}, 1250},
		"forms":        {richUIFamilies{forms: true}, 1100},
		"design":       {richUIFamilies{design: true}, 950},
		"diagrams":     {richUIFamilies{diagrams: true}, 700},
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
	// Most turns pay for the core, so it is the figure to keep in check. It holds the rule for choosing between the answer, a page and a file (ADR 0022).
	words := len(strings.Fields(core))
	if words > 1500 {
		t.Errorf("the core is %d words long, keep it under 1500", words)
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

func TestRichUIFormsBlockTeachesTheForms(t *testing.T) {
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
}

func TestRichUIDesignBlockTeachesTheDesignPieces(t *testing.T) {
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
	if !strings.Contains(promptFor(t, plain, nil), "Quiz(") {
		t.Fatal("without a choice, every family is taught, the forms too (ADR 0023)")
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
		t.Fatal("without a choice, every family is taught, a request for a quiz included")
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

func TestRichUIDiagramsBlockTeachesTheShapes(t *testing.T) {
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
}
