package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

// fakeInboxConnector lets these HTTP-layer tests seed a thread/message
// without a real Gmail or WhatsApp connection - the underlying inbox.Service
// logic itself is already covered by internal/inbox and internal/inbox/tool's
// own test suites; these tests only need to prove the routing/serialization
// layer works.
type fakeInboxConnector struct {
	channel      string
	syncMessages []inbox.NormalizedMessage
}

func (f *fakeInboxConnector) Channel() string { return f.channel }

func (f *fakeInboxConnector) Kind() connector.Kind { return connector.Kind(f.channel) }

func (f *fakeInboxConnector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityMessaging}
}

func (f *fakeInboxConnector) Sync(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	return f.syncMessages, "cursor-1", nil
}
func (f *fakeInboxConnector) Send(_ context.Context, _ *inbox.ChannelAccount, _ inbox.ConnectorSecret, _, _, _ string) (string, error) {
	return "sent-1", nil
}

func newInboxTestApp(t *testing.T) (*App, *db.IdentityStore, *inbox.Service) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "inbox-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })

	identity, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}
	if _, err := identity.EnsureBootstrap(context.Background(), db.BootstrapOptions{
		AdminEmail:           "admin@inbox.test",
		AdminPassword:        "adminpass",
		AdminDisplayName:     "Admin",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	}); err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}

	accountStore, err := db.NewChannelAccountStore(database)
	if err != nil {
		t.Fatalf("NewChannelAccountStore: %v", err)
	}
	contactStore, err := db.NewInboxContactStore(database)
	if err != nil {
		t.Fatalf("NewInboxContactStore: %v", err)
	}
	threadStore, err := db.NewInboxThreadStore(database)
	if err != nil {
		t.Fatalf("NewInboxThreadStore: %v", err)
	}
	messageStore, err := db.NewInboxMessageStore(database)
	if err != nil {
		t.Fatalf("NewInboxMessageStore: %v", err)
	}
	inboxService := inbox.NewService(accountStore, contactStore, threadStore, messageStore)

	app := &App{
		backend: seshat.NewApp(seshat.Dependencies{
			Identity: identity,
			Inbox:    inboxService,
		}),
	}
	return app, identity, inboxService
}

// newInboxTestAppWithArtifactStore is newInboxTestApp plus a real local-disk
// storage.ArtifactStore, needed by the attachment-download route test.
func newInboxTestAppWithArtifactStore(t *testing.T) (*App, *db.IdentityStore, *inbox.Service) {
	t.Helper()
	app, identity, inboxService := newInboxTestApp(t)
	store, err := storage.NewArtifactStoreFromConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewArtifactStoreFromConfig: %v", err)
	}
	inboxService.WithArtifactStore(store)
	return app, identity, inboxService
}

// seedInboxThread connects a WhatsApp account and syncs one inbound message
// through it under the given principal, returning the thread ID.
func seedInboxThread(t *testing.T, svc *inbox.Service, userID string) string {
	t.Helper()
	ctx := context.Background()
	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	if err != nil {
		t.Fatalf("ConnectAccount: %v", err)
	}
	connector := &fakeInboxConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "15551234567@s.whatsapp.net",
			ExternalMessageID:  "wa-msg-1",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "15551234567@s.whatsapp.net",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           "Table for 4 tonight?",
			SentAt:             time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	if _, err := svc.SyncAccount(ctx, principal, account.ID); err != nil {
		t.Fatalf("SyncAccount: %v", err)
	}
	threads, _, err := svc.ListThreads(ctx, principal, inbox.ListThreadsParams{})
	if err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	if len(threads) != 1 {
		t.Fatalf("expected 1 seeded thread, got %d", len(threads))
	}
	return threads[0].ID
}

func TestInboxThreadsEndToEnd(t *testing.T) {
	app, _, svc := newInboxTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@inbox.test", "adminpass")

	// Resolve the admin's own user ID via the seeded principal used by
	// svc.ConnectAccount below - loginAs already created/authenticated the
	// admin user, and ownership checks are enforced per userID, so the
	// thread must be seeded under that same admin user.
	adminID := adminUserIDFromToken(t, router, token)
	threadID := seedInboxThread(t, svc, adminID)

	// GET /inbox/threads
	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list threads: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var listResp struct {
		Threads []map[string]any `json:"threads"`
		Count   int              `json:"count"`
	}
	json.NewDecoder(rec.Body).Decode(&listResp)
	if listResp.Count != 1 {
		t.Fatalf("expected 1 thread, got %d", listResp.Count)
	}

	// GET /inbox/threads/{id}
	req = httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads/"+threadID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get thread: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var detailResp struct {
		Messages []map[string]any `json:"messages"`
	}
	json.NewDecoder(rec.Body).Decode(&detailResp)
	if len(detailResp.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(detailResp.Messages))
	}

	// POST /inbox/threads/{id}/reply (draft)
	draftBody, _ := json.Marshal(map[string]any{"body": "Yes, see you at 8pm!", "send": false})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inbox/threads/"+threadID+"/reply", bytes.NewReader(draftBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("draft reply: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var draftResp struct {
		IsDraft bool `json:"is_draft"`
	}
	json.NewDecoder(rec.Body).Decode(&draftResp)
	if !draftResp.IsDraft {
		t.Fatal("expected draft reply to be marked is_draft")
	}

	// POST /inbox/threads/{id}/reply (send)
	sendBody, _ := json.Marshal(map[string]any{"body": "Yes, see you at 8pm!", "send": true})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/inbox/threads/"+threadID+"/reply", bytes.NewReader(sendBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("send reply: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// PATCH /inbox/threads/{id} (status)
	patchBody, _ := json.Marshal(map[string]string{"status": inbox.ThreadStatusSnoozed})
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/inbox/threads/"+threadID, bytes.NewReader(patchBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("update status: got %d, body=%s", rec.Code, rec.Body.String())
	}

	// GET /inbox/accounts
	req = httptest.NewRequest(http.MethodGet, "/api/v1/inbox/accounts", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list accounts: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var accountsResp struct {
		Count int `json:"count"`
	}
	json.NewDecoder(rec.Body).Decode(&accountsResp)
	if accountsResp.Count != 1 {
		t.Fatalf("expected 1 account, got %d", accountsResp.Count)
	}
}

func TestInboxThreadsPaginationOffsetAndHasMore(t *testing.T) {
	app, _, svc := newInboxTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@inbox.test", "adminpass")
	adminID := adminUserIDFromToken(t, router, token)

	ctx := context.Background()
	principal := &backendauth.Principal{User: backendauth.User{ID: adminID}}
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	if err != nil {
		t.Fatalf("ConnectAccount: %v", err)
	}
	base := time.Now()
	connector := &fakeInboxConnector{channel: inbox.ChannelWhatsApp}
	for i := 0; i < 3; i++ {
		connector.syncMessages = append(connector.syncMessages, inbox.NormalizedMessage{
			ExternalThreadID:   fmt.Sprintf("wa-thread-page-%d", i),
			ExternalMessageID:  fmt.Sprintf("wa-msg-page-%d", i),
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  fmt.Sprintf("+1555%04d", i),
			ContactDisplayName: fmt.Sprintf("Contact %d", i),
			BodyText:           "hi",
			SentAt:             base.Add(time.Duration(i) * time.Minute),
		})
	}
	svc.RegisterConnector(connector)
	if _, err := svc.SyncAccount(ctx, principal, account.ID); err != nil {
		t.Fatalf("SyncAccount: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads?limit=2&offset=0", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list threads (page 1): got %d, body=%s", rec.Code, rec.Body.String())
	}
	var page1 struct {
		Threads []map[string]any `json:"threads"`
		HasMore bool             `json:"has_more"`
		Offset  int              `json:"offset"`
	}
	json.NewDecoder(rec.Body).Decode(&page1)
	if len(page1.Threads) != 2 {
		t.Fatalf("expected 2 threads on page 1, got %d", len(page1.Threads))
	}
	if !page1.HasMore {
		t.Fatal("expected has_more=true on page 1 (3 threads seeded, limit 2)")
	}
	if page1.Offset != 0 {
		t.Fatalf("expected offset=0 echoed back, got %d", page1.Offset)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads?limit=2&offset=2", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list threads (page 2): got %d, body=%s", rec.Code, rec.Body.String())
	}
	var page2 struct {
		Threads []map[string]any `json:"threads"`
		HasMore bool             `json:"has_more"`
	}
	json.NewDecoder(rec.Body).Decode(&page2)
	if len(page2.Threads) != 1 {
		t.Fatalf("expected 1 thread on page 2, got %d", len(page2.Threads))
	}
	if page2.HasMore {
		t.Fatal("expected has_more=false on page 2 (exhausted)")
	}
}

func TestInboxThreadDetailMessagesPaginationOffset(t *testing.T) {
	app, _, svc := newInboxTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@inbox.test", "adminpass")
	adminID := adminUserIDFromToken(t, router, token)

	ctx := context.Background()
	principal := &backendauth.Principal{User: backendauth.User{ID: adminID}}
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	if err != nil {
		t.Fatalf("ConnectAccount: %v", err)
	}
	base := time.Now()
	connector := &fakeInboxConnector{channel: inbox.ChannelWhatsApp}
	for i := 0; i < 3; i++ {
		connector.syncMessages = append(connector.syncMessages, inbox.NormalizedMessage{
			ExternalThreadID:   "wa-thread-msg-page",
			ExternalMessageID:  fmt.Sprintf("wa-msg-msg-page-%d", i),
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "15551234567@s.whatsapp.net",
			ContactDisplayName: "Restaurant Regular",
			BodyText:           fmt.Sprintf("message %d", i),
			SentAt:             base.Add(time.Duration(i) * time.Minute),
		})
	}
	svc.RegisterConnector(connector)
	if _, err := svc.SyncAccount(ctx, principal, account.ID); err != nil {
		t.Fatalf("SyncAccount: %v", err)
	}
	threads, _, err := svc.ListThreads(ctx, principal, inbox.ListThreadsParams{})
	if err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	if len(threads) != 1 {
		t.Fatalf("expected 1 seeded thread, got %d", len(threads))
	}
	threadID := threads[0].ID

	// message_offset=2 skips the 2 most recent messages, leaving only the
	// oldest one - proves the query param reaches the service layer.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads/"+threadID+"?message_offset=2", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get thread with message_offset: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var detail struct {
		Messages        []map[string]any `json:"messages"`
		MessagesHasMore bool             `json:"messages_has_more"`
	}
	json.NewDecoder(rec.Body).Decode(&detail)
	if len(detail.Messages) != 1 {
		t.Fatalf("expected 1 message after skipping the 2 most recent, got %d", len(detail.Messages))
	}
	if detail.Messages[0]["body_text"] != "message 0" {
		t.Fatalf("expected the oldest message, got %v", detail.Messages[0]["body_text"])
	}
	if detail.MessagesHasMore {
		t.Fatal("expected messages_has_more=false (only 3 messages seeded, well under the page size)")
	}
}

func TestInboxAttachmentDownload(t *testing.T) {
	app, _, svc := newInboxTestAppWithArtifactStore(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@inbox.test", "adminpass")
	adminID := adminUserIDFromToken(t, router, token)

	ctx := context.Background()
	principal := &backendauth.Principal{User: backendauth.User{ID: adminID}}
	account, err := svc.ConnectAccount(ctx, principal, inbox.ConnectAccountParams{
		Channel:           inbox.ChannelWhatsApp,
		DisplayName:       "Restaurant WhatsApp",
		ExternalAccountID: "15559998888@s.whatsapp.net",
	})
	if err != nil {
		t.Fatalf("ConnectAccount: %v", err)
	}
	connector := &fakeInboxConnector{
		channel: inbox.ChannelWhatsApp,
		syncMessages: []inbox.NormalizedMessage{{
			ExternalThreadID:   "15551234567@s.whatsapp.net",
			ExternalMessageID:  "wa-msg-att",
			Direction:          inbox.MessageDirectionInbound,
			ContactExternalID:  "15551234567@s.whatsapp.net",
			ContactDisplayName: "Restaurant Regular",
			Attachments: []inbox.Attachment{{
				Filename:    "photo.jpg",
				ContentType: "image/jpeg",
				Size:        5,
				Data:        []byte("hello"),
			}},
			SentAt: time.Now(),
		}},
	}
	svc.RegisterConnector(connector)
	if _, err := svc.SyncAccount(ctx, principal, account.ID); err != nil {
		t.Fatalf("SyncAccount: %v", err)
	}
	threads, _, err := svc.ListThreads(ctx, principal, inbox.ListThreadsParams{})
	if err != nil {
		t.Fatalf("ListThreads: %v", err)
	}
	if len(threads) != 1 {
		t.Fatalf("expected 1 seeded thread, got %d", len(threads))
	}
	threadID := threads[0].ID

	// GET /inbox/threads/{id} - confirm the attachment metadata surfaces
	// in the message response.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads/"+threadID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get thread: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var detail struct {
		Messages []messageResponse `json:"messages"`
	}
	json.NewDecoder(rec.Body).Decode(&detail)
	if len(detail.Messages) != 1 || len(detail.Messages[0].Attachments) != 1 {
		t.Fatalf("expected 1 message with 1 attachment, got %+v", detail.Messages)
	}
	att := detail.Messages[0].Attachments[0]
	if att.Filename != "photo.jpg" || att.ContentType != "image/jpeg" {
		t.Fatalf("unexpected attachment metadata: %+v", att)
	}
	messageID := detail.Messages[0].ID

	// GET the attachment itself.
	req = httptest.NewRequest(http.MethodGet, fmt.Sprintf(
		"/api/v1/inbox/threads/%s/messages/%s/attachments/%s", threadID, messageID, att.ID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("download attachment: got %d, body=%s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "hello" {
		t.Fatalf("expected attachment bytes %q, got %q", "hello", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "image/jpeg" {
		t.Fatalf("expected Content-Type image/jpeg, got %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); cd != `attachment; filename="photo.jpg"` {
		t.Fatalf("unexpected Content-Disposition: %q", cd)
	}

	// Unknown attachment ID -> 404.
	req = httptest.NewRequest(http.MethodGet, fmt.Sprintf(
		"/api/v1/inbox/threads/%s/messages/%s/attachments/does-not-exist", threadID, messageID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown attachment, got %d", rec.Code)
	}
}

func TestInboxThreadsRequiresAuth(t *testing.T) {
	app, _, _ := newInboxTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/inbox/threads", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a token, got %d", rec.Code)
	}
}

// adminUserIDFromToken resolves the authenticated user's own ID via the
// /auth/me-equivalent principal lookup already exercised elsewhere in this
// package's tests.
func adminUserIDFromToken(t *testing.T, router http.Handler, token string) string {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("get current user: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var resp struct {
		ID string `json:"id"`
	}
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.ID == "" {
		t.Fatal("expected a non-empty user id")
	}
	return resp.ID
}
