package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// newConnectorTestApp builds a minimal *App with only what
// handleConnectorAccounts/handleConnectorAccountDelete need - a real
// ConnectorAccountStore backed by a temp SQLite DB, no full seshat.App
// bootstrap (mirrors system_test.go's lightweight &App{backend: ...}
// pattern rather than api_test.go's heavier newTestAPIApp, since neither
// handler touches anything else).
func newConnectorTestApp(t *testing.T) (*App, *db.ConnectorAccountStore) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "connectors-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewConnectorAccountStore(database)
	if err != nil {
		t.Fatalf("NewConnectorAccountStore: %v", err)
	}
	app := &App{backend: &seshat.App{ConnectorAccounts: store}}
	return app, store
}

func withPrincipal(req *http.Request, userID string) *http.Request {
	principal := &backendauth.Principal{User: backendauth.User{ID: userID}}
	return req.WithContext(context.WithValue(req.Context(), authPrincipalContextKey, principal))
}

func TestHandleConnectorAccountsListScopesByUserAndKind(t *testing.T) {
	app, store := newConnectorTestApp(t)
	ctx := context.Background()

	// Two accounts for the requesting user (different kinds), one for a
	// different user - the list must return only "mine, this kind".
	mine, err := store.Create(ctx, db.CreateConnectorAccountParams{UserID: "user-1", Kind: "s3", DisplayName: "mine"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := store.Create(ctx, db.CreateConnectorAccountParams{UserID: "user-1", Kind: "mcp:demo-crm", DisplayName: "other kind"}); err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := store.Create(ctx, db.CreateConnectorAccountParams{UserID: "user-2", Kind: "s3", DisplayName: "other user"}); err != nil {
		t.Fatalf("create: %v", err)
	}

	req := withPrincipal(httptest.NewRequest(http.MethodGet, "/connectors/s3/accounts", nil), "user-1")
	rec := httptest.NewRecorder()
	app.handleConnectorAccounts(rec, req, "s3")

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Accounts []connectorAccountResponse `json:"accounts"`
		Count    int                        `json:"count"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Count != 1 || len(resp.Accounts) != 1 || resp.Accounts[0].ID != mine.ID {
		t.Fatalf("expected exactly the requesting user's own s3 account, got %+v", resp)
	}
}

func TestHandleConnectorAccountDeleteRemovesOwnAccount(t *testing.T) {
	app, store := newConnectorTestApp(t)
	ctx := context.Background()

	account, err := store.Create(ctx, db.CreateConnectorAccountParams{UserID: "user-1", Kind: "s3", DisplayName: "mine"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	req := withPrincipal(httptest.NewRequest(http.MethodDelete, "/connectors/s3/accounts/"+account.ID, nil), "user-1")
	rec := httptest.NewRecorder()
	app.handleConnectorAccountDelete(rec, req, "s3", account.ID)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if _, err := store.GetByID(ctx, account.ID); err == nil {
		t.Fatal("expected the account to be gone after delete")
	}
}

func TestHandleConnectorAccountDeleteRejectsAnotherUsersAccount(t *testing.T) {
	app, store := newConnectorTestApp(t)
	ctx := context.Background()

	account, err := store.Create(ctx, db.CreateConnectorAccountParams{UserID: "user-1", Kind: "s3", DisplayName: "not yours"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	req := withPrincipal(httptest.NewRequest(http.MethodDelete, "/connectors/s3/accounts/"+account.ID, nil), "user-2")
	rec := httptest.NewRecorder()
	app.handleConnectorAccountDelete(rec, req, "s3", account.ID)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", rec.Code, rec.Body.String())
	}
	if _, err := store.GetByID(ctx, account.ID); err != nil {
		t.Fatalf("expected the account to still exist after a rejected delete: %v", err)
	}
}

func TestHandleConnectorAccountDeleteRejectsMismatchedKind(t *testing.T) {
	app, store := newConnectorTestApp(t)
	ctx := context.Background()

	account, err := store.Create(ctx, db.CreateConnectorAccountParams{UserID: "user-1", Kind: "s3", DisplayName: "s3 account"})
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	req := withPrincipal(httptest.NewRequest(http.MethodDelete, "/connectors/mcp:demo-crm/accounts/"+account.ID, nil), "user-1")
	rec := httptest.NewRecorder()
	app.handleConnectorAccountDelete(rec, req, "mcp:demo-crm", account.ID)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when the path kind doesn't match the account's own kind, got %d: %s", rec.Code, rec.Body.String())
	}
}
