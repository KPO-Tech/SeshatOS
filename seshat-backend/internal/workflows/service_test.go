package workflows

import (
	"context"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

func TestParseDefinition_ValidYAML(t *testing.T) {
	def, err := ParseDefinition("name: demo\nnodes:\n  - id: a\n    prompt: do the thing\n")
	if err != nil {
		t.Fatalf("ParseDefinition failed: %v", err)
	}
	if def.Name != "demo" {
		t.Fatalf("expected name %q, got %q", "demo", def.Name)
	}
	if len(def.Nodes) != 1 || def.Nodes[0].ID != "a" {
		t.Fatalf("unexpected nodes: %#v", def.Nodes)
	}
}

func TestParseDefinition_InvalidYAML(t *testing.T) {
	if _, err := ParseDefinition("nodes: [this is not: valid: yaml"); err == nil {
		t.Fatal("expected an error for malformed YAML")
	} else if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Fatalf("expected ErrorKindInvalidInput, got %v", bkerr.KindOf(err))
	}
}

// A definition that fails workflow.Validate (no nodes) must be rejected
// before Run ever touches the settings service or builds an sdk.Client - a
// nil Service (no settings configured at all) proves the validation happens
// first, since resolveProvider would otherwise panic/error on the nil
// receiver before validation could be blamed for the failure.
func TestRun_RejectsInvalidDefinitionBeforeResolvingProvider(t *testing.T) {
	var svc *Service // deliberately nil - see doc comment above
	def, err := ParseDefinition("name: empty\nnodes: []\n")
	if err != nil {
		t.Fatalf("ParseDefinition failed: %v", err)
	}

	_, runErr := svc.Run(context.Background(), nil, def, RunParams{}, nil)
	if runErr == nil {
		t.Fatal("expected an error for a workflow with no nodes")
	}
	if bkerr.KindOf(runErr) != bkerr.ErrorKindInvalidInput {
		t.Fatalf("expected ErrorKindInvalidInput, got %v (%v)", bkerr.KindOf(runErr), runErr)
	}
}
