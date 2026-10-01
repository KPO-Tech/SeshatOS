package inbox

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/automation"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// fakeAsker is a WorkflowAsker test double — records every prompt (and the
// sessionID it was called with) and returns a scripted, incrementing
// session id, so tests can assert continuity across multiple "agent" node
// calls within one graph run. No real LLM call, matching this repo's
// established test policy (see fakeExecutor in workflow_dispatch_test.go).
type fakeAsker struct {
	calls          []string // prompts received, in order
	sessionIDsSeen []string // sessionID this asker was called with, in order
	nextID         int
	output         string
	err            error
}

func (f *fakeAsker) ask(_ context.Context, _, _, prompt, _, sessionID string) (string, string, error) {
	f.calls = append(f.calls, prompt)
	f.sessionIDsSeen = append(f.sessionIDsSeen, sessionID)
	if f.err != nil {
		return "", "", f.err
	}
	f.nextID++
	return f.output, "session-" + strconv.Itoa(f.nextID), nil
}

// newGraphTestService mirrors newWorkflowTestService (workflow_dispatch_test.go)
// but wires the Graph-execution path (WithNodeRegistry/WithWorkflowAsker)
// instead of WithWorkflowExecutor.
func newGraphTestService(t *testing.T, database *db.DB, asker *fakeAsker) (*Service, *WorkflowStore) {
	t.Helper()
	accounts, err := db.NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	contacts, err := db.NewInboxContactStore(database)
	if err != nil {
		t.Fatalf("NewInboxContactStore: %v", err)
	}
	threads, err := db.NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messages, err := db.NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}
	rows, err := db.NewInboxWorkflowStore(database)
	if err != nil {
		t.Fatalf("NewInboxWorkflowStore: %v", err)
	}
	workflows := NewWorkflowStore(rows)

	registry := dataflow.NewRegistry()
	dataflow.RegisterBuiltins(registry)

	svc := NewService(accounts, contacts, threads, messages).
		WithWorkflowStore(workflows).
		WithNodeRegistry(registry).
		WithWorkflowAsker(asker.ask)
	return svc, workflows
}

func TestDispatchWorkflows_RunsGraphWhenSet(t *testing.T) {
	database := openWorkflowTestDB(t)
	asker := &fakeAsker{output: "handled"}
	svc, workflows := newGraphTestService(t, database, asker)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Name:    "graph workflow",
		Trigger: automation.Trigger{Type: automation.TriggerTypeEvent, EventType: "inbox.message.received"},
		Agent:   automation.AgentConfig{Slug: "inbox-agent"},
		Graph: &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{
			{ID: "id", Type: "agent"},
			{ID: "a", Type: "query", Agent: "id", Parameters: map[string]any{"prompt": "handle this message"}},
		}},
		Status: automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction: MessageDirectionInbound, BodyText: "hello",
		ExternalThreadID: "t1", ExternalMessageID: "m1", SentAt: time.Now(),
	}, ThreadStatusOpen)

	if len(asker.calls) != 1 {
		t.Fatalf("asker calls = %d, want 1", len(asker.calls))
	}
	// The agent node's static prompt plus the triggering event's context
	// (seeded as the graph's starting input — see Service.executeGraph)
	// should both appear; buildAgentPrompt (pkg/dataflow) is what appends
	// the latter.
	if !strings.Contains(asker.calls[0], "handle this message") {
		t.Fatalf("expected the node's own prompt in the call, got %q", asker.calls[0])
	}
	if !strings.Contains(asker.calls[0], "hello") {
		t.Fatalf("expected the triggering message's body (via event_context) in the call, got %q", asker.calls[0])
	}

	runs, err := workflows.ListRuns(context.Background(), job.ID, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].Status != automation.RunStatusSuccess {
		t.Fatalf("run = %+v, want a recorded success", runs)
	}

	updated, err := workflows.GetJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if updated.RunCount != 1 {
		t.Fatalf("RunCount = %d, want 1", updated.RunCount)
	}
	if updated.Graph == nil || updated.Graph.Name != "g" {
		t.Fatalf("expected Graph to round-trip through storage, got %#v", updated.Graph)
	}
}

func TestDispatchWorkflows_GraphSharesSessionAcrossAgentNodes(t *testing.T) {
	database := openWorkflowTestDB(t)
	asker := &fakeAsker{output: "step done"}
	svc, workflows := newGraphTestService(t, database, asker)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Trigger: automation.Trigger{Type: automation.TriggerTypeEvent, EventType: "inbox.message.received"},
		Agent:   automation.AgentConfig{Slug: "inbox-agent"},
		Graph: &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{
			{ID: "id", Type: "agent"},
			{ID: "first", Type: "query", Agent: "id", Parameters: map[string]any{"prompt": "step one"}, Connections: map[string][]string{"main": {"second"}}},
			{ID: "second", Type: "query", Agent: "id", Parameters: map[string]any{"prompt": "step two"}},
		}},
		Status: automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction: MessageDirectionInbound, BodyText: "hello",
		ExternalThreadID: "t2", ExternalMessageID: "m2", SentAt: time.Now(),
	}, ThreadStatusOpen)

	if len(asker.sessionIDsSeen) != 2 {
		t.Fatalf("expected 2 asker calls, got %d", len(asker.sessionIDsSeen))
	}
	if asker.sessionIDsSeen[0] != "" {
		t.Fatalf("expected the first call to start a fresh session, got sessionID=%q", asker.sessionIDsSeen[0])
	}
	if asker.sessionIDsSeen[1] != "session-1" {
		t.Fatalf("expected the second call to continue the first call's session, got sessionID=%q", asker.sessionIDsSeen[1])
	}
}

func TestDispatchWorkflows_GraphFailsClearlyWithoutRegistry(t *testing.T) {
	database := openWorkflowTestDB(t)
	asker := &fakeAsker{output: "unused"}
	svc, workflows := newGraphTestService(t, database, asker)
	svc.nodeRegistry = nil // simulate a Service wired without WithNodeRegistry
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Trigger: automation.Trigger{Type: automation.TriggerTypeEvent, EventType: "inbox.message.received"},
		Agent:   automation.AgentConfig{Slug: "inbox-agent"},
		Graph:   &dataflow.Definition{Name: "g", Nodes: []dataflow.Node{{ID: "a", Type: "agent", Parameters: map[string]any{"prompt": "x"}}}},
		Status:  automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction: MessageDirectionInbound, BodyText: "hello",
		ExternalThreadID: "t3", ExternalMessageID: "m3", SentAt: time.Now(),
	}, ThreadStatusOpen)

	runs, err := workflows.ListRuns(context.Background(), job.ID, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].Status != automation.RunStatusError {
		t.Fatalf("run = %+v, want a recorded error", runs)
	}
	if len(asker.calls) != 0 {
		t.Fatalf("expected the asker never to be called without a registry, got %d calls", len(asker.calls))
	}
}

// TestInboxAskerFailsLoudlyOnGraphTools locks in the "fail clearly, not
// silently" contract for nodes-as-tools here - not yet implemented (only
// internal/automation's sessionAgentCaller in the SDK repo has real support
// today, see automation-app-pages.md §37.9).
func TestInboxAskerFailsLoudlyOnGraphTools(t *testing.T) {
	fake := &fakeAsker{output: "unused"}
	asker := &inboxAsker{ask: fake.ask, ownerID: "user-1"}
	graphTools := []dataflow.ToolSpec{{Name: "http_request"}}
	if _, err := asker.Ask(context.Background(), "", "do it", nil, graphTools); err == nil {
		t.Fatal("expected an error - nodes-as-tools isn't implemented here yet")
	}
	if len(fake.calls) != 0 {
		t.Fatalf("expected the underlying asker never to be called, got %d calls", len(fake.calls))
	}
}
