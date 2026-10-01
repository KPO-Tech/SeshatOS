package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	backendfiles "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/files"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

type sweepStubSessionManager struct {
	sessions []*sdk.SessionInfo
	deleted  map[string]bool
}

func (m *sweepStubSessionManager) ListSessions() ([]*sdk.SessionInfo, error) {
	return m.sessions, nil
}

func (m *sweepStubSessionManager) CreateSession(ctx context.Context) (SessionHandle, error) {
	return nil, nil
}

func (m *sweepStubSessionManager) DeleteSession(sessionID sdk.SessionID) error {
	if m.deleted == nil {
		m.deleted = map[string]bool{}
	}
	m.deleted[sessionID.String()] = true
	return nil
}

type sweepStubFilesProvider struct {
	deletedForSession map[string]bool
}

func (f *sweepStubFilesProvider) GetFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*backendfiles.File, error) {
	return nil, nil
}
func (f *sweepStubFilesProvider) DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) ([]byte, *backendfiles.File, error) {
	return nil, nil, nil
}
func (f *sweepStubFilesProvider) AttachToMessage(ctx context.Context, fileIDs []string, sessionID string, messageIndex int) error {
	return nil
}
func (f *sweepStubFilesProvider) ListMessageAttachments(ctx context.Context, sessionID string) ([]backendfiles.File, error) {
	return nil, nil
}
func (f *sweepStubFilesProvider) DeleteBySessionID(ctx context.Context, sessionID string) error {
	if f.deletedForSession == nil {
		f.deletedForSession = map[string]bool{}
	}
	f.deletedForSession[sessionID] = true
	return nil
}

func openSweepTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return database
}

// TestSweepAbandonedSessions verifies the exact scenario from the Part 2
// persistence audit: a session created (e.g. by attaching a file, see
// Home.tsx's ensureSessionCreated) but never actually used (TotalTurns==0)
// is removed once older than the grace window, while an empty-but-recent
// session and a real in-progress session are both left alone.
func TestSweepAbandonedSessions(t *testing.T) {
	database := openSweepTestDB(t)
	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	ownershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	ctx := context.Background()
	hash, err := db.HashPassword("test-password-secure")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	user, err := identityStore.CreateUser(ctx, db.CreateUserParams{
		Email:        "sweep-test@example.com",
		DisplayName:  "Sweep Test",
		PasswordHash: hash,
		Status:       db.UserStatusActive,
	})
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	for _, sessionID := range []string{"abandoned-old", "abandoned-recent", "active-old"} {
		if _, err := ownershipStore.Create(ctx, db.CreateSessionOwnershipParams{SessionID: sessionID, UserID: user.ID}); err != nil {
			t.Fatalf("Create ownership %s: %v", sessionID, err)
		}
	}

	oldEnough := time.Now().Add(-48 * time.Hour).Unix()
	tooRecent := time.Now().Add(-1 * time.Minute).Unix()

	sessions := &sweepStubSessionManager{
		sessions: []*sdk.SessionInfo{
			{ID: sdk.SessionID("abandoned-old"), TotalTurns: 0, CreatedAt: oldEnough},
			{ID: sdk.SessionID("abandoned-recent"), TotalTurns: 0, CreatedAt: tooRecent},
			{ID: sdk.SessionID("active-old"), TotalTurns: 3, CreatedAt: oldEnough},
		},
	}
	files := &sweepStubFilesProvider{}

	svc := NewService(ServiceConfig{
		Sessions:  sessions,
		Ownership: ownershipStore,
		Files:     files,
	})

	n, err := svc.SweepAbandonedSessions(ctx, 24*time.Hour)
	if err != nil {
		t.Fatalf("SweepAbandonedSessions: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 session swept, got %d", n)
	}

	if !sessions.deleted["abandoned-old"] {
		t.Error("expected abandoned-old to be deleted from the session manager")
	}
	if sessions.deleted["abandoned-recent"] {
		t.Error("abandoned-recent is within the grace window and must not be deleted")
	}
	if sessions.deleted["active-old"] {
		t.Error("active-old has real turns and must not be deleted")
	}

	if !files.deletedForSession["abandoned-old"] {
		t.Error("expected files.DeleteBySessionID to be called for abandoned-old")
	}
	if files.deletedForSession["abandoned-recent"] || files.deletedForSession["active-old"] {
		t.Error("files.DeleteBySessionID must only be called for swept sessions")
	}

	if _, err := ownershipStore.GetBySessionID(ctx, "abandoned-old"); err == nil {
		t.Error("expected ownership row for abandoned-old to be gone")
	}
	if _, err := ownershipStore.GetBySessionID(ctx, "abandoned-recent"); err != nil {
		t.Errorf("expected ownership row for abandoned-recent to remain: %v", err)
	}
	if _, err := ownershipStore.GetBySessionID(ctx, "active-old"); err != nil {
		t.Errorf("expected ownership row for active-old to remain: %v", err)
	}
}
