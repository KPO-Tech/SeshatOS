package db

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// gTokenActivityDay is what a user spent on one local day. It outlives the conversations
// it came from: deleting a chat must not rewrite the history of what was used.
type gTokenActivityDay struct {
	UserID       string `gorm:"primaryKey;column:user_id;size:128"`
	Day          string `gorm:"primaryKey;column:day;size:10"`
	InputTokens  int64  `gorm:"column:input_tokens;not null;default:0"`
	OutputTokens int64  `gorm:"column:output_tokens;not null;default:0"`
	CacheTokens  int64  `gorm:"column:cache_tokens;not null;default:0"`
}

func (gTokenActivityDay) TableName() string { return "token_activity_days" }

// gTokenActivitySession remembers when a session was last looked at, to skip the ones that
// did not change.
type gTokenActivitySession struct {
	SessionID             string `gorm:"primaryKey;column:session_id;size:128"`
	SeenUpdatedAtUnixTime int64  `gorm:"column:seen_updated_at_unix;not null;default:0"`
}

func (gTokenActivitySession) TableName() string { return "token_activity_sessions" }

// gTokenActivityCall marks one model call as counted. A save rewrites the transcript and a
// compaction takes entries out of it, so neither a position nor a sum can say what is new.
type gTokenActivityCall struct {
	SessionID string `gorm:"primaryKey;column:session_id;size:128"`
	CallKey   string `gorm:"primaryKey;column:call_key;size:128"`
}

func (gTokenActivityCall) TableName() string { return "token_activity_calls" }

// TokenActivityDay is one day of a user's token use.
type TokenActivityDay struct {
	Day          string
	InputTokens  int64
	OutputTokens int64
	CacheTokens  int64
}

// TokenActivityStore counts token use from the session transcripts, which hold the usage
// of every model call. The usage a turn returns covers only its last call.
type TokenActivityStore struct {
	db *DB
	mu sync.Mutex
}

func NewTokenActivityStore(database *DB) (*TokenActivityStore, error) {
	if database == nil {
		return nil, fmt.Errorf("token activity store: database is required")
	}
	return &TokenActivityStore{db: database}, nil
}

// transcriptsHere says whether the session tables share this database. They do on the
// desktop. Elsewhere there is nothing to count from.
func (s *TokenActivityStore) transcriptsHere() bool {
	migrator := s.db.gormDB.Migrator()
	return migrator.HasTable("session_transcript_entries") && migrator.HasTable("session_ownership")
}

// CollectSession counts what a session spent since it was last counted.
func (s *TokenActivityStore) CollectSession(ctx context.Context, sessionID string) error {
	if !s.transcriptsHere() {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.collectLocked(ctx, sessionID)
}

// CollectAll counts every session that changed since it was last looked at, which also
// brings in the history from before this table existed.
func (s *TokenActivityStore) CollectAll(ctx context.Context) error {
	if !s.transcriptsHere() {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	var changed []string
	err := s.db.gormDB.WithContext(ctx).Raw(`
		SELECT o.session_id
		FROM session_ownership o
		JOIN session_metadata m ON m.session_id = o.session_id
		LEFT JOIN token_activity_sessions c ON c.session_id = o.session_id
		WHERE c.session_id IS NULL OR m.updated_at_unix > c.seen_updated_at_unix`).Scan(&changed).Error
	if err != nil {
		return err
	}
	for _, sessionID := range changed {
		if err := s.collectLocked(ctx, sessionID); err != nil {
			return fmt.Errorf("session %s: %w", sessionID, err)
		}
	}
	return nil
}

type transcriptUsageEntry struct {
	ID       string `json:"id"`
	TurnID   string `json:"turn_id"`
	Metadata struct {
		Usage *struct {
			InputTokens              int64 `json:"input_tokens"`
			OutputTokens             int64 `json:"output_tokens"`
			CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
			CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
		} `json:"usage"`
	} `json:"metadata"`
}

// callKey names a model call for as long as the transcript keeps it. The message ID alone is
// a position in the list, which a compaction brings back down. The turn ID is unique.
func (e transcriptUsageEntry) callKey() string {
	return e.TurnID + "/" + e.ID
}

// collectLocked adds the calls of a session not counted yet. Transcript entries carry no
// date, so they go on the day the session was last saved: a session is counted when its turn
// ends, which makes that today. Only the history from before this table lands on one day.
func (s *TokenActivityStore) collectLocked(ctx context.Context, sessionID string) error {
	return s.db.gormDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var owners []string
		if err := tx.Raw(`SELECT user_id FROM session_ownership WHERE session_id = ?`, sessionID).Scan(&owners).Error; err != nil {
			return err
		}
		if len(owners) == 0 {
			return nil
		}
		var updatedAt []int64
		if err := tx.Raw(`SELECT updated_at_unix FROM session_metadata WHERE session_id = ?`, sessionID).Scan(&updatedAt).Error; err != nil {
			return err
		}
		savedAt := time.Now()
		var seenUpdatedAt int64
		if len(updatedAt) > 0 && updatedAt[0] > 0 {
			seenUpdatedAt = updatedAt[0]
			savedAt = time.Unix(seenUpdatedAt, 0)
		}

		var counted []string
		if err := tx.Model(&gTokenActivityCall{}).Where("session_id = ?", sessionID).Pluck("call_key", &counted).Error; err != nil {
			return err
		}
		known := make(map[string]bool, len(counted))
		for _, key := range counted {
			known[key] = true
		}
		var entries []string
		if err := tx.Raw(`SELECT entry_json FROM session_transcript_entries WHERE session_id = ? AND entry_json LIKE '%"usage"%'`, sessionID).
			Scan(&entries).Error; err != nil {
			return err
		}

		day := gTokenActivityDay{UserID: owners[0], Day: savedAt.In(time.Local).Format(time.DateOnly)}
		var calls []gTokenActivityCall
		for _, raw := range entries {
			var entry transcriptUsageEntry
			if err := json.Unmarshal([]byte(raw), &entry); err != nil || entry.Metadata.Usage == nil || known[entry.callKey()] {
				continue
			}
			known[entry.callKey()] = true
			calls = append(calls, gTokenActivityCall{SessionID: sessionID, CallKey: entry.callKey()})
			usage := entry.Metadata.Usage
			day.InputTokens += usage.InputTokens
			day.OutputTokens += usage.OutputTokens
			day.CacheTokens += usage.CacheReadInputTokens + usage.CacheCreationInputTokens
		}
		if len(calls) > 0 {
			if err := tx.CreateInBatches(calls, 200).Error; err != nil {
				return err
			}
			err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "user_id"}, {Name: "day"}},
				DoUpdates: clause.Assignments(map[string]any{
					"input_tokens":  gorm.Expr("token_activity_days.input_tokens + ?", day.InputTokens),
					"output_tokens": gorm.Expr("token_activity_days.output_tokens + ?", day.OutputTokens),
					"cache_tokens":  gorm.Expr("token_activity_days.cache_tokens + ?", day.CacheTokens),
				}),
			}).Create(&day).Error
			if err != nil {
				return err
			}
		}
		seen := gTokenActivitySession{SessionID: sessionID, SeenUpdatedAtUnixTime: seenUpdatedAt}
		return tx.Clauses(clause.OnConflict{UpdateAll: true}).Create(&seen).Error
	})
}

// Since returns a user's days from since (YYYY-MM-DD) on, oldest first.
func (s *TokenActivityStore) Since(ctx context.Context, userID, since string) ([]TokenActivityDay, error) {
	var rows []gTokenActivityDay
	err := s.db.gormDB.WithContext(ctx).
		Where("user_id = ? AND day >= ?", userID, since).
		Order("day ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	days := make([]TokenActivityDay, 0, len(rows))
	for _, row := range rows {
		days = append(days, TokenActivityDay{
			Day:          row.Day,
			InputTokens:  row.InputTokens,
			OutputTokens: row.OutputTokens,
			CacheTokens:  row.CacheTokens,
		})
	}
	return days, nil
}
