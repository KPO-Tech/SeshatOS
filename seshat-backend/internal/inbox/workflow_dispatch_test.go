package inbox

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/automation"
)

// Internal (package inbox, not inbox_test) so dispatchWorkflows - unexported,
// deliberately: it's an internal detail of persistNormalizedMessage, not
// part of Service's public surface - can be called directly and
// synchronously, rather than through the real (goroutine-fired) path via
// SyncAccount/IngestMessage, which would make a test race the goroutine.

func openWorkflowTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

// fakeExecutor is a WorkflowExecutor test double that records every call
// and returns a scripted result - no real LLM call, matching this repo's
// established "no network call in a unit test" policy.
type fakeExecutor struct {
	calls  int
	prompt string
	output string
	err    error
}

func (f *fakeExecutor) run(_ context.Context, _, _, prompt, _ string) (string, error) {
	f.calls++
	f.prompt = prompt
	return f.output, f.err
}

func newWorkflowTestService(t *testing.T, database *db.DB, exec *fakeExecutor) (*Service, *WorkflowStore) {
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

	svc := NewService(accounts, contacts, threads, messages).
		WithWorkflowStore(workflows).
		WithWorkflowExecutor(exec.run)
	return svc, workflows
}

func connectWorkflowTestAccount(t *testing.T, svc *Service, userID string) *ChannelAccount {
	t.Helper()
	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	account, err := svc.ConnectAccount(context.Background(), principal, ConnectAccountParams{
		Channel:           ChannelGmail,
		DisplayName:       "Test Account",
		ExternalAccountID: "test@example.com",
		AccessToken:       "access-token",
		RefreshToken:      "refresh-token",
		ExpiresAt:         time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatalf("ConnectAccount: %v", err)
	}
	return account
}

func TestDispatchWorkflows_FiresOnMatchingFilter(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{output: "Drafted a reply."}
	svc, workflows := newWorkflowTestService(t, database, exec)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Name:    "reply to invoices",
		Trigger: automation.Trigger{
			Type:        automation.TriggerTypeEvent,
			EventType:   "inbox.message.received",
			EventFilter: `$event.subject.toLowerCase().includes("invoice")`,
		},
		Agent:  automation.AgentConfig{Slug: "inbox-agent"},
		Task:   "draft a reply",
		Status: automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Billing Team", NormalizedMessage{
		Direction:        MessageDirectionInbound,
		ThreadSubject:    "Invoice #42 due",
		BodyText:         "Please pay by Friday.",
		ExternalThreadID: "t1", ExternalMessageID: "m1",
		SentAt: time.Now(),
	}, ThreadStatusOpen)

	if exec.calls != 1 {
		t.Fatalf("executor calls = %d, want 1 (matching filter should fire)", exec.calls)
	}
	if exec.prompt == "" {
		t.Fatal("expected a non-empty prompt built from the job's Task + event context")
	}

	runs, err := workflows.ListRuns(context.Background(), job.ID, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("ListRuns = %d runs, want 1", len(runs))
	}
	if runs[0].Status != automation.RunStatusSuccess || runs[0].Output != "Drafted a reply." {
		t.Fatalf("run = %+v, want a recorded success with the executor's output", runs[0])
	}

	updated, err := workflows.GetJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if updated.RunCount != 1 {
		t.Fatalf("RunCount = %d, want 1", updated.RunCount)
	}
	if updated.Status != automation.JobStatusActive {
		t.Fatalf("Status = %q, want %q (no MaxRuns budget set)", updated.Status, automation.JobStatusActive)
	}
}

func TestDispatchWorkflows_SkipsNonMatchingFilter(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{output: "should not be called"}
	svc, workflows := newWorkflowTestService(t, database, exec)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Name:    "reply to invoices",
		Trigger: automation.Trigger{
			Type:        automation.TriggerTypeEvent,
			EventType:   "inbox.message.received",
			EventFilter: `$event.subject.includes("invoice")`,
		},
		Agent:  automation.AgentConfig{Slug: "inbox-agent"},
		Task:   "draft a reply",
		Status: automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction:        MessageDirectionInbound,
		ThreadSubject:    "Lunch tomorrow?",
		BodyText:         "Are you free?",
		ExternalThreadID: "t2", ExternalMessageID: "m2",
		SentAt: time.Now(),
	}, ThreadStatusOpen)

	if exec.calls != 0 {
		t.Fatalf("executor calls = %d, want 0 (filter should not match)", exec.calls)
	}
}

func TestDispatchWorkflows_IgnoresOutboundMessages(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{}
	svc, workflows := newWorkflowTestService(t, database, exec)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Trigger: automation.Trigger{Type: automation.TriggerTypeEvent, EventType: "inbox.message.received"},
		Agent:   automation.AgentConfig{Slug: "inbox-agent"},
		Task:    "draft a reply",
		Status:  automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Me", NormalizedMessage{
		Direction:        MessageDirectionOutbound,
		BodyText:         "my own reply",
		ExternalThreadID: "t3", ExternalMessageID: "m3",
		SentAt: time.Now(),
	}, ThreadStatusOpen)

	if exec.calls != 0 {
		t.Fatalf("executor calls = %d, want 0 (an outbound message must never re-fire a rule)", exec.calls)
	}
}

func TestDispatchWorkflows_RecordsExecutorError(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{err: errors.New("provider unavailable")}
	svc, workflows := newWorkflowTestService(t, database, exec)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Trigger: automation.Trigger{Type: automation.TriggerTypeEvent, EventType: "inbox.message.received"},
		Agent:   automation.AgentConfig{Slug: "inbox-agent"},
		Task:    "draft a reply",
		Status:  automation.JobStatusActive,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction:        MessageDirectionInbound,
		BodyText:         "hello",
		ExternalThreadID: "t4", ExternalMessageID: "m4",
		SentAt: time.Now(),
	}, ThreadStatusOpen)

	runs, err := workflows.ListRuns(context.Background(), job.ID, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].Status != automation.RunStatusError || runs[0].Error != "provider unavailable" {
		t.Fatalf("run = %+v, want a recorded error", runs)
	}
}

func TestDispatchWorkflows_MaxRunsExhaustsToInactive(t *testing.T) {
	database := openWorkflowTestDB(t)
	exec := &fakeExecutor{output: "ok"}
	svc, workflows := newWorkflowTestService(t, database, exec)
	account := connectWorkflowTestAccount(t, svc, "user-1")

	job := &automation.Job{
		OwnerID: "user-1",
		Trigger: automation.Trigger{Type: automation.TriggerTypeEvent, EventType: "inbox.message.received"},
		Agent:   automation.AgentConfig{Slug: "inbox-agent"},
		Task:    "draft a reply",
		Status:  automation.JobStatusActive,
		MaxRuns: 1,
	}
	if err := workflows.CreateJob(context.Background(), job); err != nil {
		t.Fatalf("CreateJob: %v", err)
	}

	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction: MessageDirectionInbound, BodyText: "hello",
		ExternalThreadID: "t5", ExternalMessageID: "m5", SentAt: time.Now(),
	}, ThreadStatusOpen)

	updated, err := workflows.GetJob(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if updated.Status != automation.JobStatusInactive {
		t.Fatalf("Status = %q, want %q after exhausting MaxRuns=1", updated.Status, automation.JobStatusInactive)
	}

	// A second matching message must not fire the now-inactive workflow again.
	svc.dispatchWorkflows(account.ID, "Someone", NormalizedMessage{
		Direction: MessageDirectionInbound, BodyText: "hello again",
		ExternalThreadID: "t5", ExternalMessageID: "m6", SentAt: time.Now(),
	}, ThreadStatusOpen)
	if exec.calls != 1 {
		t.Fatalf("executor calls = %d, want 1 (inactive workflow must not fire again)", exec.calls)
	}
}
