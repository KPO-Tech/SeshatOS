package query

import (
	"context"
	"errors"
	"strconv"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// A turn the app was closed during was never counted. Deleting its chat must not lose it, and
// must not change what was already counted.
func TestDeleteSessionKeepsItsTokenActivity(t *testing.T) {
	database := openSweepTestDB(t)
	ctx := context.Background()
	ownership, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatal(err)
	}
	activity, err := db.NewTokenActivityStore(database)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := db.HashPassword("test-password-secure")
	if err != nil {
		t.Fatal(err)
	}
	user, err := identity.CreateUser(ctx, db.CreateUserParams{Email: "activity@example.com", DisplayName: "Activity", PasswordHash: hash, Status: db.UserStatusActive})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{SessionID: "s1", UserID: user.ID}); err != nil {
		t.Fatal(err)
	}
	exec := func(statement string, args ...any) {
		t.Helper()
		if err := database.GormDB().Exec(statement, args...).Error; err != nil {
			t.Fatal(err)
		}
	}
	exec(`INSERT INTO session_metadata (session_id, status, created_at_unix, updated_at_unix, metadata_json) VALUES ('s1', 'active', 1, 1779444000, '{}')`)
	addCall := func(index int, turnID string, input int) {
		t.Helper()
		entry := `{"id":"msg-2","type":"assistant","role":"assistant","turn_id":"` + turnID + `","timestamp":"0001-01-01T00:00:00Z","metadata":{"usage":{"input_tokens":` + strconv.Itoa(input) + `,"output_tokens":1}}}`
		exec(`INSERT INTO session_transcript_entries (session_id, entry_index, entry_json) VALUES ('s1', ?, ?)`, index, entry)
	}
	addCall(1, "turn-counted", 100)
	if err := activity.CollectSession(ctx, "s1"); err != nil {
		t.Fatal(err)
	}
	addCall(2, "turn-never-counted", 40)

	svc := NewService(ServiceConfig{
		Sessions:  &sweepStubSessionManager{},
		Ownership: ownership,
		BeforeDelete: func(ctx context.Context, sessionID string) {
			if err := activity.CollectSession(ctx, sessionID); err != nil {
				t.Errorf("count: %v", err)
			}
		},
	})
	principal := &backendauth.Principal{User: backendauth.User{ID: user.ID}}
	if err := svc.DeleteSession(ctx, principal, "s1"); err != nil {
		t.Fatal(err)
	}
	if _, err := ownership.GetBySessionID(ctx, "s1"); err == nil {
		t.Fatal("the session should be gone")
	}

	days, err := activity.Since(ctx, user.ID, "2000-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].InputTokens != 140 {
		t.Fatalf("what the chat spent must stay: %+v", days)
	}
}

func TestDeleteSessionOfAnotherUserCountsNothing(t *testing.T) {
	database := openSweepTestDB(t)
	ctx := context.Background()
	ownership, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatal(err)
	}
	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatal(err)
	}
	hash, err := db.HashPassword("test-password-secure")
	if err != nil {
		t.Fatal(err)
	}
	owner, err := identity.CreateUser(ctx, db.CreateUserParams{Email: "owner@example.com", DisplayName: "Owner", PasswordHash: hash, Status: db.UserStatusActive})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{SessionID: "s1", UserID: owner.ID}); err != nil {
		t.Fatal(err)
	}
	var hookErr error
	svc := NewService(ServiceConfig{
		Sessions:  &sweepStubSessionManager{},
		Ownership: ownership,
		BeforeDelete: func(context.Context, string) {
			hookErr = errors.New("ran for a refused deletion")
		},
	})
	if err := svc.DeleteSession(ctx, &backendauth.Principal{User: backendauth.User{ID: "someone-else"}}, "s1"); err == nil {
		t.Fatal("the deletion should be refused")
	}
	if hookErr != nil {
		t.Fatal(hookErr)
	}
}
