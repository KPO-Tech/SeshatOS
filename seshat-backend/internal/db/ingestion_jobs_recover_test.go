package db

import (
	"context"
	"testing"
	"time"
)

// A file that makes the app crash was started again at every launch, for ever: the jobs left running by a worker that no longer exists
// are tried again only as often as a job may be tried, then set aside with a reason.
func TestAJobThatKeepsInterruptingTheAppIsSetAsideAfterItsAttempts(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	store, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatal(err)
	}
	job, err := store.Create(ctx, CreateKnowledgeIngestionJobParams{CorpusID: "c", FileID: "f", UserID: "u", Filename: "f.pdf", MaxAttempts: 3})
	if err != nil {
		t.Fatal(err)
	}
	other, err := store.Create(ctx, CreateKnowledgeIngestionJobParams{CorpusID: "c", FileID: "g", UserID: "u", Filename: "g.pdf", MaxAttempts: 3, Priority: 5})
	if err != nil {
		t.Fatal(err)
	}

	for attempt := 1; attempt <= 3; attempt++ {
		claimed, err := store.ClaimNextDue(ctx, time.Hour)
		if err != nil || claimed == nil || claimed.ID != job.ID || claimed.AttemptCount != attempt {
			t.Fatalf("attempt %d: claimed %+v, err %v", attempt, claimed, err)
		}
		// The app closes here, with the job running. The next start recovers it.
		if err := store.RecoverInterrupted(ctx); err != nil {
			t.Fatalf("recover: %v", err)
		}
		got, _ := store.GetByID(ctx, job.ID)
		if attempt < 3 && got.Status != IngestionJobStatusPending {
			t.Fatalf("after attempt %d the job is %q, want waiting", attempt, got.Status)
		}
		if attempt == 3 && (got.Status != IngestionJobStatusFailed || got.LastError == "") {
			t.Fatalf("after attempt 3 the job is %q (%q), want failed with a reason", got.Status, got.LastError)
		}
	}

	// The others go on: the next job taken is the other file's.
	next, err := store.ClaimNextDue(ctx, time.Hour)
	if err != nil || next == nil || next.ID != other.ID {
		t.Fatalf("the next job is %+v, err %v; want the other file's", next, err)
	}
}
