package query

import (
	"context"
	"errors"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
	"github.com/KPO-Tech/seshat-runtime/pkg/types"
)

func newEmptySession(t *testing.T) *sdk.Session {
	t.Helper()
	cfg := sdk.DefaultClientConfig()
	cfg.PersistSessions = false
	cfg.WorkingDir = t.TempDir()
	client, err := sdk.NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	t.Cleanup(func() { _ = client.Close() })
	session, err := client.CreateSession(context.Background())
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	return session
}

func TestRegenerationDoesNothingUnlessItIsAsked(t *testing.T) {
	if err := rewindForRegeneration(newEmptySession(t), QueryInput{}); err != nil {
		t.Fatalf("a plain prompt must not rewind anything: %v", err)
	}
}

func TestAskingAgainWhenThereIsNothingToTakeBackIsAConflict(t *testing.T) {
	err := rewindForRegeneration(newEmptySession(t), QueryInput{RegenerateLastTurn: true})
	if err == nil {
		t.Fatal("an empty session has no answer to ask again")
	}
	var typed *bkerr.Error
	if !errors.As(err, &typed) || typed.Kind != bkerr.ErrorKindConflict {
		t.Fatalf("want a conflict the client can tell apart from a failure, got %v", err)
	}
}

func userSaid(text string) types.Message {
	return types.Message{Role: types.RoleUser, Content: []types.ContentBlock{types.TextContent{Text: text}}}
}

func TestTheLastTurnPromptIsWhatThePersonWrote(t *testing.T) {
	messages := []types.Message{
		userSaid("first question"),
		{Role: types.RoleAssistant, Content: []types.ContentBlock{types.TextContent{Text: "answer"}}},
		userSaid("second question"),
		{Role: types.RoleAssistant, Content: []types.ContentBlock{types.ToolUseContent{ID: "c1", Name: "read"}}},
		{Role: types.RoleUser, Content: []types.ContentBlock{types.ToolResultContent{ToolUseID: "c1", Content: "ok"}}},
		userSaid("[The previous turn stopped because of an error: api_invalid before it finished.]"),
	}
	if got, ok := lastTurnPrompt(messages); !ok || got != "second question" {
		t.Fatalf("got %q, %v: neither a tool result nor the error note is a prompt", got, ok)
	}
	if _, ok := lastTurnPrompt(nil); ok {
		t.Fatal("an empty conversation has no prompt")
	}
}

func TestTheNoteOfAStoppedTurnIsNotAPrompt(t *testing.T) {
	messages := []types.Message{
		userSaid("first question"),
		{Role: types.RoleAssistant, Content: []types.ContentBlock{types.TextContent{Text: "half an answer"}}},
		userSaid("[The previous turn was interrupted by the user before it finished. Everything done in it is preserved above. If asked to continue, resume from where it stopped; do not start over.]"),
	}
	if got, ok := lastTurnPrompt(messages); !ok || got != "first question" {
		t.Fatalf("got %q, %v: the note the runtime adds when the person stops a turn is not a prompt", got, ok)
	}
}
