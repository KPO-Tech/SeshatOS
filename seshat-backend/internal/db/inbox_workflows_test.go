package db

import (
	"context"
	"testing"
	"time"
)

// TestInboxWorkflowStore_CreateReturnsMintedID is the regression test for a
// real bug found while wiring this up: Create/CreateRun used to take the
// row by value and mint an ID inside that local copy without returning it,
// so every caller ended up with an empty ID after "successfully" creating
// a row - silently breaking every later Get/Update/Delete by ID.
func TestInboxWorkflowStore_CreateReturnsMintedID(t *testing.T) {
	database := openTestDB(t)
	store, err := NewInboxWorkflowStore(database)
	if err != nil {
		t.Fatalf("NewInboxWorkflowStore: %v", err)
	}
	ctx := context.Background()

	created, err := store.Create(ctx, InboxWorkflowRow{
		UserID:      "user-1",
		Name:        "reply to invoices",
		TriggerType: "event",
		EventType:   "inbox.message.received",
		EventFilter: `$event.subject.includes("invoice")`,
		AgentSlug:   "inbox-agent",
		Task:        "draft a reply",
		Status:      "active",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected Create to return a non-empty minted ID")
	}

	fetched, err := store.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if fetched == nil {
		t.Fatal("expected to find the workflow by its minted ID")
	}
	if fetched.Name != "reply to invoices" {
		t.Errorf("Name = %q, want %q", fetched.Name, "reply to invoices")
	}
	if fetched.EventFilter != `$event.subject.includes("invoice")` {
		t.Errorf("EventFilter = %q, want the round-tripped filter", fetched.EventFilter)
	}
}

func TestInboxWorkflowStore_ListScopesByUser(t *testing.T) {
	database := openTestDB(t)
	store, err := NewInboxWorkflowStore(database)
	if err != nil {
		t.Fatalf("NewInboxWorkflowStore: %v", err)
	}
	ctx := context.Background()

	if _, err := store.Create(ctx, InboxWorkflowRow{UserID: "user-1", Name: "a", TriggerType: "event", Status: "active"}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := store.Create(ctx, InboxWorkflowRow{UserID: "user-2", Name: "b", TriggerType: "event", Status: "active"}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	forUser1, err := store.List(ctx, "user-1")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(forUser1) != 1 || forUser1[0].Name != "a" {
		t.Fatalf("List(user-1) = %+v, want exactly the one workflow owned by user-1", forUser1)
	}

	all, err := store.List(ctx, "")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("List(\"\") returned %d workflows, want 2 (all owners)", len(all))
	}
}

func TestInboxWorkflowStore_UpdateAndDelete(t *testing.T) {
	database := openTestDB(t)
	store, err := NewInboxWorkflowStore(database)
	if err != nil {
		t.Fatalf("NewInboxWorkflowStore: %v", err)
	}
	ctx := context.Background()

	created, err := store.Create(ctx, InboxWorkflowRow{UserID: "user-1", Name: "original", TriggerType: "event", Status: "active"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	created.Name = "renamed"
	created.RunCount = 3
	if err := store.Update(ctx, *created); err != nil {
		t.Fatalf("Update: %v", err)
	}
	fetched, err := store.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if fetched.Name != "renamed" || fetched.RunCount != 3 {
		t.Fatalf("after Update, got %+v, want Name=renamed RunCount=3", fetched)
	}

	if err := store.Delete(ctx, created.ID, "user-1"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	afterDelete, err := store.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get after delete: %v", err)
	}
	if afterDelete != nil {
		t.Fatal("expected the workflow to be gone after Delete")
	}
}

func TestInboxWorkflowStore_RunLifecycle(t *testing.T) {
	database := openTestDB(t)
	store, err := NewInboxWorkflowStore(database)
	if err != nil {
		t.Fatalf("NewInboxWorkflowStore: %v", err)
	}
	ctx := context.Background()

	workflow, err := store.Create(ctx, InboxWorkflowRow{UserID: "user-1", Name: "wf", TriggerType: "event", Status: "active"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	run, err := store.CreateRun(ctx, InboxWorkflowRunRow{
		WorkflowID: workflow.ID,
		StartedAt:  time.Now(),
		Status:     "running",
	})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if run.ID == "" {
		t.Fatal("expected CreateRun to return a non-empty minted ID")
	}

	endedAt := time.Now()
	run.EndedAt = &endedAt
	run.Status = "success"
	run.Output = "drafted a reply"
	if err := store.UpdateRun(ctx, *run); err != nil {
		t.Fatalf("UpdateRun: %v", err)
	}

	runs, err := store.ListRuns(ctx, workflow.ID, 10)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 || runs[0].Status != "success" || runs[0].Output != "drafted a reply" {
		t.Fatalf("ListRuns = %+v, want one successful run with the recorded output", runs)
	}

	fetched, err := store.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	if fetched == nil || fetched.EndedAt == nil {
		t.Fatalf("GetRun = %+v, want the completed run with EndedAt set", fetched)
	}
}
