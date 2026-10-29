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
	// The full block is the ceiling: a catalog that grows past this should be a deliberate choice.
	if words := len(strings.Fields(block)); words > 2400 {
		t.Errorf("the full block is %d words long, keep it under 2400", words)
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
