package db

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func tokenActivityTestStore(t *testing.T) (*TokenActivityStore, *DB) {
	t.Helper()
	database := openSQLiteTestDB(t)
	store, err := NewTokenActivityStore(database)
	if err != nil {
		t.Fatal(err)
	}
	return store, database
}

func addSession(t *testing.T, database *DB, sessionID, userID string, updatedAt int64) {
	t.Helper()
	exec(t, database, `INSERT OR REPLACE INTO session_ownership (session_id, user_id, created_at_unix, updated_at_unix) VALUES (?, ?, 1, 1)`, sessionID, userID)
	exec(t, database, `INSERT INTO session_metadata (session_id, status, created_at_unix, updated_at_unix, metadata_json) VALUES (?, 'active', 1, ?, '{}')
		ON CONFLICT(session_id) DO UPDATE SET updated_at_unix = excluded.updated_at_unix`, sessionID, updatedAt)
}

var nextEntryIndex int

// addCall writes an entry the way the runtime does: a list position as ID, the turn's UUID,
// and no date.
func addCall(t *testing.T, database *DB, sessionID, turnID string, position int, input, output int64) {
	t.Helper()
	nextEntryIndex++
	entry := fmt.Sprintf(`{"id":"msg-%d","type":"assistant","role":"assistant","turn_id":%q,"timestamp":"0001-01-01T00:00:00Z","metadata":{"turn_id":%q,"usage":{"input_tokens":%d,"output_tokens":%d,"cache_read_input_tokens":3,"cache_creation_input_tokens":2}}}`,
		position, turnID, turnID, input, output)
	exec(t, database, `INSERT INTO session_transcript_entries (session_id, entry_index, entry_json) VALUES (?, ?, ?)`, sessionID, nextEntryIndex, entry)
}

func exec(t *testing.T, database *DB, statement string, args ...any) {
	t.Helper()
	if err := database.gormDB.Exec(statement, args...).Error; err != nil {
		t.Fatal(err)
	}
}

// The unix time of noon on a local day, so the day a row lands on does not depend on the zone.
func localNoon(year int, month time.Month, day int) int64 {
	return time.Date(year, month, day, 12, 0, 0, 0, time.Local).Unix()
}

func TestTokenActivityAddsEveryModelCallOnTheDayOfTheSave(t *testing.T) {
	store, database := tokenActivityTestStore(t)
	ctx := context.Background()
	addSession(t, database, "s1", "u1", localNoon(2026, 5, 22))
	addCall(t, database, "s1", "turn-a", 2, 100, 10)
	addCall(t, database, "s1", "turn-a", 4, 200, 20)
	exec(t, database, `INSERT INTO session_transcript_entries (session_id, entry_index, entry_json) VALUES ('s1', 1000, '{"id":"msg-1","role":"user"}')`)

	if err := store.CollectAll(ctx); err != nil {
		t.Fatal(err)
	}
	days, err := store.Since(ctx, "u1", "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].Day != "2026-05-22" || days[0].InputTokens != 300 || days[0].OutputTokens != 30 || days[0].CacheTokens != 10 {
		t.Fatalf("days %+v", days)
	}

	// The next turn, a day later, goes on its own day.
	addSession(t, database, "s1", "u1", localNoon(2026, 5, 23))
	addCall(t, database, "s1", "turn-b", 6, 50, 5)
	if err := store.CollectSession(ctx, "s1"); err != nil {
		t.Fatal(err)
	}
	days, err = store.Since(ctx, "u1", "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 2 || days[0].InputTokens != 300 || days[1].Day != "2026-05-23" || days[1].InputTokens != 50 {
		t.Fatalf("days %+v", days)
	}
}

func TestTokenActivityCountsEachCallOnceAcrossRewritesAndCompaction(t *testing.T) {
	store, database := tokenActivityTestStore(t)
	ctx := context.Background()
	addSession(t, database, "s1", "u1", localNoon(2026, 5, 22))
	addCall(t, database, "s1", "turn-a", 2, 100, 10)
	addCall(t, database, "s1", "turn-a", 4, 100, 10)
	for range 2 {
		if err := store.CollectSession(ctx, "s1"); err != nil {
			t.Fatal(err)
		}
	}

	// A save rewrites the whole transcript, and a compaction leaves fewer entries. The list
	// is shorter, so a new call in a later turn gets a position an old one already had.
	exec(t, database, `DELETE FROM session_transcript_entries WHERE session_id = 's1'`)
	addCall(t, database, "s1", "turn-a", 4, 100, 10)
	addCall(t, database, "s1", "turn-b", 2, 50, 5)
	if err := store.CollectSession(ctx, "s1"); err != nil {
		t.Fatal(err)
	}

	days, err := store.Since(ctx, "u1", "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].InputTokens != 250 || days[0].OutputTokens != 25 {
		t.Fatalf("days %+v", days)
	}
}

func TestTokenActivityOutlivesTheConversationAndStaysPerUser(t *testing.T) {
	store, database := tokenActivityTestStore(t)
	ctx := context.Background()
	addSession(t, database, "s1", "u1", localNoon(2026, 5, 22))
	addSession(t, database, "s2", "u2", localNoon(2026, 5, 22))
	addCall(t, database, "s1", "turn-a", 2, 100, 10)
	addCall(t, database, "s2", "turn-b", 2, 900, 90)
	if err := store.CollectAll(ctx); err != nil {
		t.Fatal(err)
	}

	exec(t, database, `DELETE FROM session_transcript_entries WHERE session_id = 's1'`)
	exec(t, database, `DELETE FROM session_ownership WHERE session_id = 's1'`)
	exec(t, database, `DELETE FROM session_metadata WHERE session_id = 's1'`)
	if err := store.CollectAll(ctx); err != nil {
		t.Fatal(err)
	}

	days, err := store.Since(ctx, "u1", "2026-01-01")
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].InputTokens != 100 {
		t.Fatalf("a deleted chat must keep its history, and one user must not see another's: %+v", days)
	}
}

func TestTokenActivityCollectAllSkipsWhatDidNotChange(t *testing.T) {
	store, database := tokenActivityTestStore(t)
	ctx := context.Background()
	addSession(t, database, "s1", "u1", localNoon(2026, 5, 22))
	addCall(t, database, "s1", "turn-a", 2, 100, 10)
	if err := store.CollectAll(ctx); err != nil {
		t.Fatal(err)
	}

	addCall(t, database, "s1", "turn-b", 4, 100, 10)
	if err := store.CollectAll(ctx); err != nil {
		t.Fatal(err)
	}
	days, _ := store.Since(ctx, "u1", "2026-01-01")
	if len(days) != 1 || days[0].InputTokens != 100 {
		t.Fatalf("an unchanged session must not be read again: %+v", days)
	}

	addSession(t, database, "s1", "u1", localNoon(2026, 5, 23))
	if err := store.CollectAll(ctx); err != nil {
		t.Fatal(err)
	}
	days, _ = store.Since(ctx, "u1", "2026-01-01")
	if len(days) != 2 {
		t.Fatalf("a changed session must be counted: %+v", days)
	}
}

func TestTokenActivityWithoutTranscriptsHereDoesNothing(t *testing.T) {
	store, database := tokenActivityTestStore(t)
	exec(t, database, `DROP TABLE session_ownership`)
	if store.transcriptsHere() {
		t.Fatal("the table was just dropped")
	}
	if err := store.CollectAll(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := store.CollectSession(context.Background(), "s1"); err != nil {
		t.Fatal(err)
	}
}
