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
	block := richAnswersBlock()
	if block == "" {
		t.Fatal("the embedded catalog must produce a block")
	}
	for _, want := range []string{"seshat-ui", "root = ", "Table(", "Metric(", "Callout(", "Steps(", "Examples:", "never a Markdown table", "three steps or more"} {
		if !strings.Contains(block, want) {
			t.Errorf("the block must mention %q", want)
		}
	}
	// Every turn pays for this block: a catalog that grows past this should be a deliberate choice.
	if words := len(strings.Fields(block)); words > 1200 {
		t.Errorf("the block is %d words long, keep it under 1200", words)
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
