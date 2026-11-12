package query

import (
	"strings"
	"testing"
)

func TestNaturalWritingIsAddedOnlyWhenTheUserTurnedItOn(t *testing.T) {
	on := appendedPrompt(t, &Service{preferences: fakePreferences{richAnswers: true, naturalWriting: true}})
	if !strings.Contains(on, "## Writing style: plain and human") {
		t.Fatal("the writing rules must be in the prompt when the person turned them on")
	}
	off := appendedPrompt(t, &Service{preferences: fakePreferences{richAnswers: true}})
	if strings.Contains(off, "Writing style: plain and human") {
		t.Fatal("the writing rules are opt-in: they must not be in the prompt by default")
	}
	if strings.Contains(appendedPrompt(t, &Service{}), "Writing style: plain and human") {
		t.Fatal("with no preferences at all the rules stay off")
	}
}

func TestNaturalWritingLeavesWhatThePersonAsksForAlone(t *testing.T) {
	// The rules shape prose: a list or a format the person asks for in the turn wins, and code and components keep their own rules.
	for _, want := range []string{"anything the person explicitly asks for", "code, commands, data, the components", "em dash"} {
		if !strings.Contains(naturalWritingBlock, want) {
			t.Errorf("the block must say %q", want)
		}
	}
}
