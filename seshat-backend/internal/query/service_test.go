package query

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/types"
)

// ─── minimal runtime stubs ────────────────────────────────────────────────────

type stubRuntime struct {
	result *QueryResult
	err    error
}

func (r *stubRuntime) RunPrompt(_ context.Context, _ QueryInput) (*QueryResult, error) {
	return r.result, r.err
}

type stubStreamingRuntime struct {
	stubRuntime
	streamResult *QueryResult
	streamErr    error
}

func (r *stubStreamingRuntime) StreamPrompt(_ context.Context, _ QueryInput, _ func(sdk.ResponseChunk), _ func(sdk.RuntimeEvent)) (*QueryResult, error) {
	return r.streamResult, r.streamErr
}

type stubSessionHandle struct {
	id sdk.SessionID
}

func (h stubSessionHandle) GetID() sdk.SessionID { return h.id }
func (h stubSessionHandle) Close() error         { return nil }

type stubSearchSessionManager struct {
	sessions     []*sdk.SessionInfo
	searchIDs    []sdk.SessionID
	searchCalled bool
}

func (m *stubSearchSessionManager) ListSessions() ([]*sdk.SessionInfo, error) {
	return m.sessions, nil
}

func (m *stubSearchSessionManager) CreateSession(context.Context) (SessionHandle, error) {
	return stubSessionHandle{id: "created"}, nil
}

func (m *stubSearchSessionManager) DeleteSession(sdk.SessionID) error { return nil }

func (m *stubSearchSessionManager) SearchTranscriptsByContent(_ string, _ int) ([]sdk.SessionID, error) {
	m.searchCalled = true
	return m.searchIDs, nil
}

type sessionManagerWithoutSearch struct {
	inner *stubSearchSessionManager
}

func (m sessionManagerWithoutSearch) ListSessions() ([]*sdk.SessionInfo, error) {
	return m.inner.ListSessions()
}

func (m sessionManagerWithoutSearch) CreateSession(ctx context.Context) (SessionHandle, error) {
	return m.inner.CreateSession(ctx)
}

func (m sessionManagerWithoutSearch) DeleteSession(id sdk.SessionID) error {
	return m.inner.DeleteSession(id)
}

type stubInspectorRuntime struct {
	messages map[string][]types.Message
}

func (r *stubInspectorRuntime) RunPrompt(context.Context, QueryInput) (*QueryResult, error) {
	return nil, nil
}

func (r *stubInspectorRuntime) LoadSessionMessages(_ context.Context, sessionID string) ([]types.Message, error) {
	return r.messages[sessionID], nil
}

// ─── SupportsStreaming ────────────────────────────────────────────────────────

func TestSupportsStreamingNilRuntime(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if svc.SupportsStreaming() {
		t.Error("nil runtime should not support streaming")
	}
}

func TestSupportsStreamingNonStreamingRuntime(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubRuntime{}})
	if svc.SupportsStreaming() {
		t.Error("non-streaming runtime should report false")
	}
}

func TestSupportsStreamingStreamingRuntime(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubStreamingRuntime{}})
	if !svc.SupportsStreaming() {
		t.Error("streaming runtime should report true")
	}
}

// ─── RunPrompt guards ─────────────────────────────────────────────────────────

func TestRunPromptNilRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	_, err := svc.RunPrompt(context.Background(), nil, QueryInput{Prompt: "hello"})
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected unavailable, got %v", err)
	}
}

func TestRunPromptEmptyPromptReturnsInvalidInput(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubRuntime{}})
	_, err := svc.RunPrompt(context.Background(), nil, QueryInput{Prompt: "   "})
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected invalid_input, got %v", err)
	}
}

// ─── StreamPrompt guards ──────────────────────────────────────────────────────

func TestStreamPromptNilRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{})
	_, err := svc.StreamPrompt(context.Background(), nil, QueryInput{Prompt: "hi"}, nil, nil)
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected unavailable, got %v", err)
	}
}

func TestStreamPromptEmptyPromptReturnsInvalidInput(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubStreamingRuntime{}})
	_, err := svc.StreamPrompt(context.Background(), nil, QueryInput{Prompt: ""}, nil, nil)
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected invalid_input, got %v", err)
	}
}

func TestStreamPromptNonStreamingRuntimeReturnsUnavailable(t *testing.T) {
	svc := NewService(ServiceConfig{Runtime: &stubRuntime{}})
	_, err := svc.StreamPrompt(context.Background(), nil, QueryInput{Prompt: "hi"}, nil, nil)
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected unavailable for non-streaming runtime, got %v", err)
	}
}

// ─── encodeBinding / decodeBinding ───────────────────────────────────────────

func TestEncodeDecodeBinidngRoundtrip(t *testing.T) {
	cases := []struct {
		settingID string
		modelID   string
	}{
		{"setting-abc", "claude-3-5-sonnet"},
		{"setting-xyz", ""},
		{"", ""},
	}
	for _, tc := range cases {
		encoded := encodeBinding(tc.settingID, tc.modelID)
		gotSetting, gotModel := decodeBinding(encoded)
		if gotSetting != tc.settingID || gotModel != tc.modelID {
			t.Errorf("roundtrip(%q, %q): got (%q, %q)", tc.settingID, tc.modelID, gotSetting, gotModel)
		}
	}
}

func TestDecodeBindingEmptyString(t *testing.T) {
	s, m := decodeBinding("")
	if s != "" || m != "" {
		t.Errorf("expected empty, got (%q, %q)", s, m)
	}
}

func TestEncodeBindingEmptySettingIDReturnsEmpty(t *testing.T) {
	if got := encodeBinding("", "some-model"); got != "" {
		t.Errorf("expected empty for empty settingID, got %q", got)
	}
}

// ─── listSessionsUnscoped ─────────────────────────────────────────────────────

func TestListSessionsUnscopedNilSessionsReturnsEmpty(t *testing.T) {
	svc := NewService(ServiceConfig{Sessions: nil})
	sessions, err := svc.listSessionsUnscoped()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(sessions) != 0 {
		t.Errorf("expected empty slice, got %v", sessions)
	}
}

// ─── checkSessionAccess ───────────────────────────────────────────────────────

func TestCheckSessionAccessNilOwnershipAlwaysPasses(t *testing.T) {
	svc := NewService(ServiceConfig{})
	// With no ownership store, any session ID (even non-empty) passes.
	if err := svc.checkSessionAccess(context.Background(), nil, "any-session-id"); err != nil {
		t.Errorf("expected nil error, got %v", err)
	}
}

func TestCheckSessionAccessBlankIDAlwaysPasses(t *testing.T) {
	svc := NewService(ServiceConfig{})
	if err := svc.checkSessionAccess(context.Background(), nil, ""); err != nil {
		t.Errorf("expected nil error for blank session ID, got %v", err)
	}
}

// ─── prepareRuntimeInput ──────────────────────────────────────────────────────

// Without this, submit_plan always persisted plan documents with an empty
// UserID, which then failed the ownership check on every later read/patch
// (see QueryInput.UserID's doc comment).
func TestPrepareRuntimeInputCarriesPrincipalUserID(t *testing.T) {
	svc := NewService(ServiceConfig{})
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-42"}}

	runtimeInput, errMsg, err := svc.prepareRuntimeInput(context.Background(), principal, QueryInput{Prompt: "hi"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if errMsg != "" {
		t.Fatalf("unexpected error message: %q", errMsg)
	}
	if runtimeInput.UserID != "user-42" {
		t.Errorf("expected UserID %q to be carried through, got %q", "user-42", runtimeInput.UserID)
	}
}

func TestPrepareRuntimeInputNilPrincipalLeavesUserIDEmpty(t *testing.T) {
	svc := NewService(ServiceConfig{})
	runtimeInput, _, err := svc.prepareRuntimeInput(context.Background(), nil, QueryInput{Prompt: "hi"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if runtimeInput.UserID != "" {
		t.Errorf("expected empty UserID with nil principal, got %q", runtimeInput.UserID)
	}
}

func TestSearchSessionsByContentUsesDirectSearcher(t *testing.T) {
	now := time.Now().Unix()
	manager := &stubSearchSessionManager{
		sessions: []*sdk.SessionInfo{
			{ID: "session-a", CreatedAt: now - 10, UpdatedAt: now - 5},
			{ID: "session-b", CreatedAt: now - 20, UpdatedAt: now - 1},
		},
		searchIDs: []sdk.SessionID{"session-b"},
	}
	svc := NewService(ServiceConfig{Sessions: manager})

	results, err := svc.SearchSessionsByContent(context.Background(), nil, "needle", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !manager.searchCalled {
		t.Fatal("expected direct transcript search to be used")
	}
	if len(results) != 1 || results[0].SessionID != "session-b" {
		t.Fatalf("expected session-b result, got %#v", results)
	}
}

func TestSearchSessionsByContentFallsBackToInspector(t *testing.T) {
	now := time.Now().Unix()
	manager := &stubSearchSessionManager{
		sessions: []*sdk.SessionInfo{
			{ID: "session-a", CreatedAt: now - 10, UpdatedAt: now - 5},
			{ID: "session-b", CreatedAt: now - 20, UpdatedAt: now - 1},
		},
	}
	runtime := &stubInspectorRuntime{
		messages: map[string][]types.Message{
			"session-a": {
				{Role: types.RoleUser, Content: []types.ContentBlock{types.TextContent{Text: "plain text"}}},
			},
			"session-b": {
				{Role: types.RoleUser, Content: []types.ContentBlock{types.TextContent{Text: "contains needle here"}}},
			},
		},
	}
	svc := NewService(ServiceConfig{
		Runtime:  runtime,
		Sessions: sessionManagerWithoutSearch{inner: manager},
	})

	results, err := svc.SearchSessionsByContent(context.Background(), nil, "needle", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if manager.searchCalled {
		t.Fatal("direct search should not be available through the fallback wrapper")
	}
	if len(results) != 1 || results[0].SessionID != "session-b" {
		t.Fatalf("expected fallback to find session-b, got %#v", results)
	}
}

func TestInitialTitleFromPromptCleansPrompt(t *testing.T) {
	got := initialTitleFromPrompt("Salut, cherche en ligne toutes les nouveautes et evolution sur la generation d'image. https://example.com")
	want := "En ligne toutes les nouveautes et evolution sur la generation"
	if got != want {
		t.Fatalf("initialTitleFromPrompt() = %q, want %q", got, want)
	}
}

func TestEnsureInitialSessionTitleDoesNotOverwriteExistingTitle(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	ownership, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("new ownership store: %v", err)
	}
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-42"}}
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{
		SessionID: "sess-1",
		UserID:    principal.User.ID,
		Title:     "Manual Title",
	}); err != nil {
		t.Fatalf("create ownership: %v", err)
	}

	svc := NewService(ServiceConfig{Ownership: ownership})
	title, err := svc.EnsureInitialSessionTitle(ctx, principal, "sess-1", "explain the French real estate market")
	if err != nil {
		t.Fatalf("ensure title: %v", err)
	}
	if title != "" {
		t.Fatalf("expected no replacement title, got %q", title)
	}
	row, err := ownership.GetBySessionID(ctx, "sess-1")
	if err != nil {
		t.Fatalf("get ownership: %v", err)
	}
	if row.Title != "Manual Title" {
		t.Fatalf("expected manual title to remain, got %q", row.Title)
	}
}

func TestEnsureInitialSessionTitleUpdatesUntitledSession(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	ownership, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("new ownership store: %v", err)
	}
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-42"}}
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{
		SessionID: "sess-1",
		UserID:    principal.User.ID,
		Title:     "Untitled conversation",
	}); err != nil {
		t.Fatalf("create ownership: %v", err)
	}

	svc := NewService(ServiceConfig{Ownership: ownership})
	title, err := svc.EnsureInitialSessionTitle(ctx, principal, "sess-1", "compare les rendements locatifs en france")
	if err != nil {
		t.Fatalf("ensure title: %v", err)
	}
	if title != "Compare les rendements locatifs en france" {
		t.Fatalf("unexpected title %q", title)
	}
	row, err := ownership.GetBySessionID(ctx, "sess-1")
	if err != nil {
		t.Fatalf("get ownership: %v", err)
	}
	if row.Title != title {
		t.Fatalf("expected persisted title %q, got %q", title, row.Title)
	}
}

// ─── UpdateSessionMetadata provider/model switching ───────────────────────────

func TestEnsureInitialSessionTitleUpdatesSDKUntitledSession(t *testing.T) {
	ctx := context.Background()
	database, err := db.Open(ctx, db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "sessions.db")))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	ownership, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("new ownership store: %v", err)
	}
	principal := &backendauth.Principal{User: backendauth.User{ID: "user-42"}}
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{
		SessionID: "sess-1",
		UserID:    principal.User.ID,
		Title:     "untitled_session_7",
	}); err != nil {
		t.Fatalf("create ownership: %v", err)
	}

	svc := NewService(ServiceConfig{Ownership: ownership})
	title, err := svc.EnsureInitialSessionTitle(ctx, principal, "sess-1", "analyse mon cv et propose un titre")
	if err != nil {
		t.Fatalf("ensure title: %v", err)
	}
	if title != "Analyse mon cv et propose un titre" {
		t.Fatalf("unexpected title %q", title)
	}
	row, err := ownership.GetBySessionID(ctx, "sess-1")
	if err != nil {
		t.Fatalf("get ownership: %v", err)
	}
	if row.Title != title {
		t.Fatalf("expected persisted title %q, got %q", title, row.Title)
	}
}

func newTestOwnershipStore(t *testing.T) *db.SessionOwnershipStore {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	store, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("new session ownership store: %v", err)
	}
	return store
}

// TestUpdateSessionMetadataRejectsProviderSwitchAfterFirstTurn is the
// regression test for the unguarded rebind: prepareRuntimeInput already
// enforces TotalTurns==0 before letting a query bind a session's
// provider/model, but UpdateSessionMetadata's provider branch called
// ownership.UpdateProviderSelection directly with no such check - a session
// with existing turns could have its bound provider/model swapped at any
// time via this endpoint.
func TestUpdateSessionMetadataRejectsProviderSwitchAfterFirstTurn(t *testing.T) {
	ctx := context.Background()
	ownership := newTestOwnershipStore(t)
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{SessionID: "sess-1", UserID: "user-1"}); err != nil {
		t.Fatalf("create session ownership: %v", err)
	}
	sessions := &stubSearchSessionManager{sessions: []*sdk.SessionInfo{
		{ID: sdk.SessionID("sess-1"), TotalTurns: 2},
	}}
	svc := NewService(ServiceConfig{Ownership: ownership, Sessions: sessions})

	newProviderID := "provider-2"
	err := svc.UpdateSessionMetadata(ctx, nil, "sess-1", nil, nil, nil, &newProviderID, nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected switching provider on a session with existing turns to be rejected")
	}
	if bkerr.KindOf(err) != bkerr.ErrorKindConflict {
		t.Fatalf("expected a conflict error, got kind=%v err=%v", bkerr.KindOf(err), err)
	}

	after, err := ownership.GetBySessionID(ctx, "sess-1")
	if err != nil {
		t.Fatalf("get session ownership: %v", err)
	}
	if after.ProviderSettingID != "" {
		t.Fatalf("expected provider selection to remain unchanged, got %q", after.ProviderSettingID)
	}
}

// TestUpdateSessionMetadataAllowsProviderSwitchBeforeFirstTurn is the sanity
// check that a fresh session (no turns yet) can still bind its provider
// through this endpoint - this fix must not block the legitimate case.
func TestUpdateSessionMetadataAllowsProviderSwitchBeforeFirstTurn(t *testing.T) {
	ctx := context.Background()
	ownership := newTestOwnershipStore(t)
	if _, err := ownership.Create(ctx, db.CreateSessionOwnershipParams{SessionID: "sess-1", UserID: "user-1"}); err != nil {
		t.Fatalf("create session ownership: %v", err)
	}
	sessions := &stubSearchSessionManager{sessions: []*sdk.SessionInfo{
		{ID: sdk.SessionID("sess-1"), TotalTurns: 0},
	}}
	svc := NewService(ServiceConfig{Ownership: ownership, Sessions: sessions})

	newProviderID := "provider-2"
	if err := svc.UpdateSessionMetadata(ctx, nil, "sess-1", nil, nil, nil, &newProviderID, nil, nil, nil, nil); err != nil {
		t.Fatalf("unexpected error binding provider on a fresh session: %v", err)
	}

	after, err := ownership.GetBySessionID(ctx, "sess-1")
	if err != nil {
		t.Fatalf("get session ownership: %v", err)
	}
	if after.ProviderSettingID != newProviderID {
		t.Fatalf("expected provider selection to update to %q, got %q", newProviderID, after.ProviderSettingID)
	}
}
