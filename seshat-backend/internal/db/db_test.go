package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
)

func TestAPIKeyStore_CreateAndResolve(t *testing.T) {
	database := openTestDB(t)
	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, store, "apikeyuser@example.com")

	keyStore, err := NewAPIKeyStore(database)
	if err != nil {
		t.Fatalf("NewAPIKeyStore: %v", err)
	}

	key, err := keyStore.CreateAPIKey(ctx, user.ID, "test-key", nil)
	if err != nil {
		t.Fatalf("CreateAPIKey: %v", err)
	}
	if key.ID == "" {
		t.Fatal("expected non-empty key ID")
	}
	if !isValidAPIKeyFormat(key.Key) {
		t.Fatalf("expected key to start with 'sk-', got %q", key.Key)
	}
	if key.KeyMasked == key.Key {
		t.Fatal("expected masked key to differ from plaintext key")
	}

	row, err := keyStore.GetAPIKeyByKey(ctx, key.Key)
	if err != nil {
		t.Fatalf("GetAPIKeyByKey: %v", err)
	}
	if row.KeyHash == key.Key {
		t.Fatal("expected stored api key to be hashed, but plaintext was persisted")
	}
	if !strings.HasPrefix(row.KeyHash, apiKeyHashPrefix) {
		t.Fatalf("expected stored api key hash to use %q prefix, got %q", apiKeyHashPrefix, row.KeyHash)
	}
	if row.KeySuffix == "" {
		t.Fatal("expected stored api key suffix to be populated")
	}

	// Resolve the user via the key.
	resolved, err := keyStore.GetUserByAPIKey(ctx, key.Key)
	if err != nil {
		t.Fatalf("GetUserByAPIKey: %v", err)
	}
	if resolved.ID != user.ID {
		t.Fatalf("expected user ID %q, got %q", user.ID, resolved.ID)
	}
}

func TestAPIKeyStore_Expiry(t *testing.T) {
	database := openTestDB(t)
	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, store, "expiry@example.com")

	keyStore, err := NewAPIKeyStore(database)
	if err != nil {
		t.Fatalf("NewAPIKeyStore: %v", err)
	}

	past := time.Now().UTC().Add(-time.Hour)
	key, err := keyStore.CreateAPIKey(ctx, user.ID, "expired-key", &past)
	if err != nil {
		t.Fatalf("CreateAPIKey: %v", err)
	}

	_, err = keyStore.GetUserByAPIKey(ctx, key.Key)
	if err == nil {
		t.Fatal("expected error for expired key, got nil")
	}
}

func TestAPIKeyStore_ListAndRevoke(t *testing.T) {
	database := openTestDB(t)
	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, store, "listrevoke@example.com")

	keyStore, err := NewAPIKeyStore(database)
	if err != nil {
		t.Fatalf("NewAPIKeyStore: %v", err)
	}

	k1, _ := keyStore.CreateAPIKey(ctx, user.ID, "key-1", nil)
	k2, _ := keyStore.CreateAPIKey(ctx, user.ID, "key-2", nil)

	keys, err := keyStore.ListAPIKeysForUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListAPIKeysForUser: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("expected 2 keys, got %d", len(keys))
	}

	if err := keyStore.RevokeAPIKey(ctx, k1.ID, user.ID); err != nil {
		t.Fatalf("RevokeAPIKey: %v", err)
	}

	keys, err = keyStore.ListAPIKeysForUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListAPIKeysForUser after revoke: %v", err)
	}
	if len(keys) != 1 {
		t.Fatalf("expected 1 key after revoke, got %d", len(keys))
	}
	if keys[0].ID != k2.ID {
		t.Fatalf("expected remaining key %q, got %q", k2.ID, keys[0].ID)
	}
}

func TestAPIKeyStore_Touch(t *testing.T) {
	database := openTestDB(t)
	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, store, "touch@example.com")

	keyStore, err := NewAPIKeyStore(database)
	if err != nil {
		t.Fatalf("NewAPIKeyStore: %v", err)
	}

	key, _ := keyStore.CreateAPIKey(ctx, user.ID, "touch-key", nil)

	row, err := keyStore.GetAPIKeyByKey(ctx, key.Key)
	if err != nil {
		t.Fatalf("GetAPIKeyByKey: %v", err)
	}
	if row.LastUsedAtUnix != nil {
		t.Fatal("expected nil LastUsedAt before touch")
	}

	if err := keyStore.TouchAPIKey(ctx, row.ID); err != nil {
		t.Fatalf("TouchAPIKey: %v", err)
	}

	row, err = keyStore.GetAPIKeyByKey(ctx, key.Key)
	if err != nil {
		t.Fatalf("GetAPIKeyByKey after touch: %v", err)
	}
	if row.LastUsedAtUnix == nil {
		t.Fatal("expected non-nil LastUsedAt after touch")
	}
}

func TestAPIKeyStore_RevokeAll(t *testing.T) {
	database := openTestDB(t)
	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, store, "revokeall@example.com")

	keyStore, err := NewAPIKeyStore(database)
	if err != nil {
		t.Fatalf("NewAPIKeyStore: %v", err)
	}

	keyStore.CreateAPIKey(ctx, user.ID, "k1", nil)
	keyStore.CreateAPIKey(ctx, user.ID, "k2", nil)
	keyStore.CreateAPIKey(ctx, user.ID, "k3", nil)

	if err := keyStore.RevokeAllForUser(ctx, user.ID); err != nil {
		t.Fatalf("RevokeAllForUser: %v", err)
	}

	keys, err := keyStore.ListAPIKeysForUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListAPIKeysForUser after RevokeAll: %v", err)
	}
	if len(keys) != 0 {
		t.Fatalf("expected 0 keys after RevokeAll, got %d", len(keys))
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func bootstrapTestUser(t *testing.T, ctx context.Context, store *IdentityStore, email string) *User {
	t.Helper()
	hash, err := HashPassword("test-password-secure")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	user, err := store.CreateUser(ctx, CreateUserParams{
		Email:        email,
		DisplayName:  "Test User",
		PasswordHash: hash,
		Status:       UserStatusActive,
	})
	if err != nil {
		t.Fatalf("CreateUser(%s): %v", email, err)
	}
	return user
}

func isValidAPIKeyFormat(key string) bool {
	return len(key) > 3 && key[:3] == "sk-"
}

func TestAuditLogStoreCRUD(t *testing.T) {
	database := openTestDB(t)
	store, err := NewAuditLogStore(database)
	if err != nil {
		t.Fatalf("NewAuditLogStore: %v", err)
	}

	ctx := context.Background()

	// Create a log entry
	log, err := store.Create(ctx, CreateAuditLogParams{
		ActorUserID:  "user-1",
		Action:       AuditActionAuthLogin,
		ResourceType: "",
		ResourceID:   "",
		IPAddress:    "127.0.0.1",
		Status:       AuditStatusSuccess,
		Metadata:     map[string]any{"source": "test"},
	})
	if err != nil {
		t.Fatalf("Create audit log: %v", err)
	}
	if log.ID == "" {
		t.Fatal("expected non-empty audit log ID")
	}
	if log.Action != AuditActionAuthLogin {
		t.Fatalf("expected action %q, got %q", AuditActionAuthLogin, log.Action)
	}
	if log.Metadata["source"] != "test" {
		t.Fatalf("expected metadata source=test, got %v", log.Metadata)
	}

	// Create a second log entry for a different user
	_, err = store.Create(ctx, CreateAuditLogParams{
		ActorUserID: "user-2",
		Action:      AuditActionFileUpload,
		Status:      AuditStatusSuccess,
	})
	if err != nil {
		t.Fatalf("Create audit log (user-2): %v", err)
	}

	// List all — should return both
	all, err := store.List(ctx, ListAuditLogsParams{Limit: 50})
	if err != nil {
		t.Fatalf("List all audit logs: %v", err)
	}
	if len(all) < 2 {
		t.Fatalf("expected at least 2 audit logs, got %d", len(all))
	}

	// List scoped to user-1
	scoped, err := store.List(ctx, ListAuditLogsParams{ActorUserID: "user-1", Limit: 50})
	if err != nil {
		t.Fatalf("List scoped audit logs: %v", err)
	}
	if len(scoped) != 1 {
		t.Fatalf("expected 1 audit log for user-1, got %d", len(scoped))
	}
	if scoped[0].ActorUserID != "user-1" {
		t.Fatalf("expected actor_user_id=user-1, got %q", scoped[0].ActorUserID)
	}

	// Filter by action prefix
	loginLogs, err := store.List(ctx, ListAuditLogsParams{Action: "auth.", Limit: 50})
	if err != nil {
		t.Fatalf("List by action prefix: %v", err)
	}
	if len(loginLogs) != 1 {
		t.Fatalf("expected 1 auth log, got %d", len(loginLogs))
	}
}

func TestAuditLogStoreDefaultStatus(t *testing.T) {
	database := openTestDB(t)
	store, err := NewAuditLogStore(database)
	if err != nil {
		t.Fatalf("NewAuditLogStore: %v", err)
	}

	log, err := store.Create(context.Background(), CreateAuditLogParams{
		ActorUserID: "user-1",
		Action:      AuditActionAuthLogout,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if log.Status != AuditStatusSuccess {
		t.Fatalf("expected default status %q, got %q", AuditStatusSuccess, log.Status)
	}
}

func TestAuditLogStoreValidation(t *testing.T) {
	database := openTestDB(t)
	store, err := NewAuditLogStore(database)
	if err != nil {
		t.Fatalf("NewAuditLogStore: %v", err)
	}

	ctx := context.Background()

	if _, err := store.Create(ctx, CreateAuditLogParams{Action: "auth.login"}); err == nil {
		t.Fatal("expected error for empty actor_user_id")
	}
	if _, err := store.Create(ctx, CreateAuditLogParams{ActorUserID: "user-1"}); err == nil {
		t.Fatal("expected error for empty action")
	}
}

func TestUsageCounterStoreIncrement(t *testing.T) {
	database := openTestDB(t)
	store, err := NewUsageCounterStore(database)
	if err != nil {
		t.Fatalf("NewUsageCounterStore: %v", err)
	}

	ctx := context.Background()
	now := time.Now()
	dayKey := DayPeriodKey(now)
	monthKey := MonthPeriodKey(now)

	// First increment creates the row
	if err := store.Increment(ctx, "user-1", "queries", dayKey, 1); err != nil {
		t.Fatalf("Increment (create): %v", err)
	}
	count, err := store.Get(ctx, "user-1", "queries", dayKey)
	if err != nil {
		t.Fatalf("Get after create: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count=1, got %d", count)
	}

	// Second increment updates the row
	if err := store.Increment(ctx, "user-1", "queries", dayKey, 2); err != nil {
		t.Fatalf("Increment (update): %v", err)
	}
	count, err = store.Get(ctx, "user-1", "queries", dayKey)
	if err != nil {
		t.Fatalf("Get after update: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected count=3, got %d", count)
	}

	// Get returns 0 for missing key
	count, err = store.Get(ctx, "user-1", "queries", monthKey)
	if err != nil {
		t.Fatalf("Get missing key: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected count=0 for missing key, got %d", count)
	}

	// ListByUser returns existing entries
	rows, err := store.ListByUser(ctx, "user-1", "", 10)
	if err != nil {
		t.Fatalf("ListByUser: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 usage counter, got %d", len(rows))
	}
	if rows[0].Count != 3 {
		t.Fatalf("expected list count=3, got %d", rows[0].Count)
	}
}

func TestPeriodKeys(t *testing.T) {
	ts := time.Date(2026, 5, 14, 12, 0, 0, 0, time.UTC)
	if got := DayPeriodKey(ts); got != "2026-05-14" {
		t.Fatalf("DayPeriodKey: expected %q, got %q", "2026-05-14", got)
	}
	if got := MonthPeriodKey(ts); got != "2026-05" {
		t.Fatalf("MonthPeriodKey: expected %q, got %q", "2026-05", got)
	}
}

func TestCredentials_UpsertAndGet(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	if err := database.UpsertCredential(ctx, "test/key", "secret-value"); err != nil {
		t.Fatalf("UpsertCredential: %v", err)
	}

	val, ok, err := database.GetCredential(ctx, "test/key")
	if err != nil {
		t.Fatalf("GetCredential: %v", err)
	}
	if !ok {
		t.Fatal("expected credential to exist, got not-found")
	}
	if val != "secret-value" {
		t.Fatalf("expected %q, got %q", "secret-value", val)
	}
}

func TestCredentials_NotFound(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	val, ok, err := database.GetCredential(ctx, "nonexistent/key")
	if err != nil {
		t.Fatalf("GetCredential for missing key: %v", err)
	}
	if ok {
		t.Fatalf("expected not-found for missing key, got value %q", val)
	}
}

func TestCredentials_Upsert_Overwrites(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	database.UpsertCredential(ctx, "overwrite/key", "first-value")
	if err := database.UpsertCredential(ctx, "overwrite/key", "second-value"); err != nil {
		t.Fatalf("second UpsertCredential: %v", err)
	}

	val, _, err := database.GetCredential(ctx, "overwrite/key")
	if err != nil {
		t.Fatalf("GetCredential after overwrite: %v", err)
	}
	if val != "second-value" {
		t.Fatalf("expected %q after overwrite, got %q", "second-value", val)
	}
}

func TestCredentials_Delete(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	database.UpsertCredential(ctx, "del/key", "value")

	if err := database.DeleteCredential(ctx, "del/key"); err != nil {
		t.Fatalf("DeleteCredential: %v", err)
	}

	_, ok, err := database.GetCredential(ctx, "del/key")
	if err != nil {
		t.Fatalf("GetCredential after delete: %v", err)
	}
	if ok {
		t.Fatal("expected credential to be gone after delete")
	}
}

func TestCredentials_ListKeys(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	database.UpsertCredential(ctx, "key-a", "v1")
	database.UpsertCredential(ctx, "key-b", "v2")
	database.UpsertCredential(ctx, "key-c", "v3")

	keys, err := database.ListCredentialKeys(ctx)
	if err != nil {
		t.Fatalf("ListCredentialKeys: %v", err)
	}
	if len(keys) < 3 {
		t.Fatalf("expected at least 3 keys, got %d", len(keys))
	}
}

func TestCredentials_EncryptionRoundTrip(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	original := "super-secret-api-key-12345-abcdef"
	database.UpsertCredential(ctx, "enc/test", original)

	retrieved, ok, err := database.GetCredential(ctx, "enc/test")
	if err != nil || !ok {
		t.Fatalf("GetCredential: %v (ok=%v)", err, ok)
	}
	if retrieved != original {
		t.Fatalf("encryption round-trip failed: expected %q, got %q", original, retrieved)
	}
}

func TestCredentials_DeleteNonExistent(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()

	// Deleting a non-existent key should not return an error.
	if err := database.DeleteCredential(ctx, "does-not-exist"); err != nil {
		t.Fatalf("DeleteCredential for non-existent key: %v", err)
	}
}

func TestOpenSQLiteAutoMigratesSharedSchema(t *testing.T) {
	database, err := Open(context.Background(), DefaultSQLiteConfig(filepath.Join(t.TempDir(), "seshat.db")))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer database.Close()

	expectedTables := []string{
		migrationTableName,
		"schema_migrations",
		// core runtime tables
		"session_metadata",
		"session_transcript_entries",
		"session_checkpoints",
		// backend: migration 001
		"files",
		"credentials",
		"users",
		"roles",
		"user_roles",
		"organizations",
		"workspaces",
		"workspace_memberships",
		"auth_sessions",
		"session_ownership",
		"corpora",
		"corpus_files",
		"knowledge_ingestion_jobs",
		"provider_settings",
		"provider_oauth_connections",
		"web_search_settings",
		"web_search_logs",
		"audit_logs",
		"usage_counters",
		// backend: migrations 003-013
		"provider_models",
		"api_keys",
		"search_provider_configs",
		"embedder_config",
		"user_memories",
		"storage_config",
		"user_preferences",
		"mcp_servers",
	}
	for _, tableName := range expectedTables {
		var got string
		err := database.SQL().QueryRowContext(
			context.Background(),
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
			tableName,
		).Scan(&got)
		if err == sql.ErrNoRows {
			t.Fatalf("expected table %q to exist", tableName)
		}
		if err != nil {
			t.Fatalf("query table %q failed: %v", tableName, err)
		}
		if got != tableName {
			t.Fatalf("expected table %q, got %q", tableName, got)
		}
	}
}

func TestOpenSQLiteRecordsBackendAndCoreMigrations(t *testing.T) {
	database, err := Open(context.Background(), DefaultSQLiteConfig(filepath.Join(t.TempDir(), "migrations.db")))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer database.Close()

	applied, err := listAppliedMigrations(context.Background(), database, "")
	if err != nil {
		t.Fatalf("listAppliedMigrations failed: %v", err)
	}
	expected := expectedMigrationKeys()
	if len(applied) != len(expected) {
		t.Fatalf("expected %d applied migrations, got %d (%v)", len(expected), len(applied), applied)
	}
	for _, key := range applied {
		if !expected[key] {
			t.Fatalf("unexpected applied migration %q", key)
		}
	}
}

func expectedMigrationKeys() map[string]bool {
	expected := make(map[string]bool)
	for _, migration := range append(sqliteCoreMigrations(), backendMigrations()...) {
		expected[migration.Scope+":"+migration.ID] = true
	}
	return expected
}

// ─── EmbedderConfigStore ─────────────────────────────────────────────────────

func TestEmbedderConfigStore_NilBeforeUpsert(t *testing.T) {
	database := openTestDB(t)
	store, err := NewEmbedderConfigStore(database)
	if err != nil {
		t.Fatalf("NewEmbedderConfigStore: %v", err)
	}

	cfg, err := store.Get(context.Background())
	if err != nil {
		t.Fatalf("Get before upsert: %v", err)
	}
	if cfg != nil {
		t.Fatal("expected nil config before first upsert")
	}
}

func TestEmbedderConfigStore_UpsertAndGet(t *testing.T) {
	database := openTestDB(t)
	store, err := NewEmbedderConfigStore(database)
	if err != nil {
		t.Fatalf("NewEmbedderConfigStore: %v", err)
	}

	ctx := context.Background()
	apiKey := "embed-api-key-secret"

	cfg, err := store.Upsert(ctx, UpsertEmbedderConfigParams{
		Provider: "openai",
		BaseURL:  "https://api.openai.com/v1",
		APIKey:   &apiKey,
		Model:    "text-embedding-3-large",
		Enabled:  true,
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if cfg.Provider != "openai" {
		t.Fatalf("expected provider %q, got %q", "openai", cfg.Provider)
	}
	if !cfg.HasAPIKey {
		t.Fatal("expected HasAPIKey to be true")
	}
	if cfg.Model != "text-embedding-3-large" {
		t.Fatalf("expected model %q, got %q", "text-embedding-3-large", cfg.Model)
	}
	if !cfg.Enabled {
		t.Fatal("expected Enabled to be true")
	}

	// Second upsert updates values
	updated, err := store.Upsert(ctx, UpsertEmbedderConfigParams{
		Provider: "ollama",
		Model:    "nomic-embed-text",
		Enabled:  false,
	})
	if err != nil {
		t.Fatalf("second Upsert: %v", err)
	}
	if updated.Provider != "ollama" {
		t.Fatalf("expected updated provider %q, got %q", "ollama", updated.Provider)
	}
	if updated.Enabled {
		t.Fatal("expected Enabled to be false after second upsert")
	}
	// API key unchanged when nil
	if !updated.HasAPIKey {
		t.Fatal("expected HasAPIKey to remain true when key not updated")
	}
}

func TestEmbedderConfigStore_APIKeyEncryptionRoundTrip(t *testing.T) {
	database := openTestDB(t)
	store, err := NewEmbedderConfigStore(database)
	if err != nil {
		t.Fatalf("NewEmbedderConfigStore: %v", err)
	}

	ctx := context.Background()
	plainKey := "super-secret-embedder-key-abc123"
	store.Upsert(ctx, UpsertEmbedderConfigParams{
		Provider: "openai",
		APIKey:   &plainKey,
		Model:    "text-embedding-ada-002",
		Enabled:  true,
	})

	decrypted, err := store.GetDecryptedAPIKey(ctx)
	if err != nil {
		t.Fatalf("GetDecryptedAPIKey: %v", err)
	}
	if decrypted != plainKey {
		t.Fatalf("expected %q, got %q", plainKey, decrypted)
	}
}

func TestEmbedderConfigStore_ClearAPIKey(t *testing.T) {
	database := openTestDB(t)
	store, err := NewEmbedderConfigStore(database)
	if err != nil {
		t.Fatalf("NewEmbedderConfigStore: %v", err)
	}

	ctx := context.Background()
	apiKey := "key-to-be-cleared"
	store.Upsert(ctx, UpsertEmbedderConfigParams{Provider: "openai", APIKey: &apiKey, Enabled: true})

	emptyKey := ""
	updated, err := store.Upsert(ctx, UpsertEmbedderConfigParams{
		Provider: "openai",
		APIKey:   &emptyKey,
		Enabled:  true,
	})
	if err != nil {
		t.Fatalf("Upsert with empty key: %v", err)
	}
	if updated.HasAPIKey {
		t.Fatal("expected HasAPIKey to be false after clearing with empty string")
	}
}

// ─── StorageConfigStore ───────────────────────────────────────────────────────

func TestStorageConfigStore_UpsertLocal(t *testing.T) {
	database := openTestDB(t)
	store, err := NewStorageConfigStore(database)
	if err != nil {
		t.Fatalf("NewStorageConfigStore: %v", err)
	}

	ctx := context.Background()

	cfg, err := store.Upsert(ctx, UpsertStorageConfigParams{
		Provider:  "local",
		LocalPath: "/data/seshat/uploads",
	})
	if err != nil {
		t.Fatalf("Upsert local: %v", err)
	}
	if cfg.Provider != "local" {
		t.Fatalf("expected provider %q, got %q", "local", cfg.Provider)
	}
	if cfg.LocalPath != "/data/seshat/uploads" {
		t.Fatalf("expected local path %q, got %q", "/data/seshat/uploads", cfg.LocalPath)
	}
	if !cfg.IsConfigured {
		t.Fatal("expected IsConfigured to be true for local provider")
	}

	fetched, err := store.Get(ctx)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if fetched.Provider != "local" {
		t.Fatalf("expected provider %q after Get, got %q", "local", fetched.Provider)
	}
}

func TestStorageConfigStore_UpsertS3(t *testing.T) {
	database := openTestDB(t)
	store, err := NewStorageConfigStore(database)
	if err != nil {
		t.Fatalf("NewStorageConfigStore: %v", err)
	}

	ctx := context.Background()
	accessKey := "AKIAIOSFODNN7EXAMPLE"
	secretKey := "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

	cfg, err := store.Upsert(ctx, UpsertStorageConfigParams{
		Provider:    "s3",
		S3Endpoint:  "https://s3.amazonaws.com",
		S3Bucket:    "my-seshat-bucket",
		S3AccessKey: &accessKey,
		S3SecretKey: &secretKey,
		S3Region:    "eu-west-1",
	})
	if err != nil {
		t.Fatalf("Upsert S3: %v", err)
	}
	if cfg.Provider != "s3" {
		t.Fatalf("expected provider %q, got %q", "s3", cfg.Provider)
	}
	if !cfg.HasS3AccessKey {
		t.Fatal("expected HasS3AccessKey to be true")
	}
	if !cfg.HasS3SecretKey {
		t.Fatal("expected HasS3SecretKey to be true")
	}
	if cfg.S3Region != "eu-west-1" {
		t.Fatalf("expected region %q, got %q", "eu-west-1", cfg.S3Region)
	}
	if !cfg.IsConfigured {
		t.Fatal("expected IsConfigured to be true for S3 with endpoint and bucket")
	}

	// Decrypt round-trip
	gotAccess, gotSecret, err := store.GetDecryptedS3Keys(ctx)
	if err != nil {
		t.Fatalf("GetDecryptedS3Keys: %v", err)
	}
	if gotAccess != accessKey {
		t.Fatalf("expected access key round-trip %q, got %q", accessKey, gotAccess)
	}
	if gotSecret != secretKey {
		t.Fatalf("expected secret key round-trip %q, got %q", secretKey, gotSecret)
	}
}

func TestStorageConfigStore_DefaultProvider(t *testing.T) {
	database := openTestDB(t)
	store, err := NewStorageConfigStore(database)
	if err != nil {
		t.Fatalf("NewStorageConfigStore: %v", err)
	}

	ctx := context.Background()
	cfg, err := store.Upsert(ctx, UpsertStorageConfigParams{})
	if err != nil {
		t.Fatalf("Upsert with empty provider: %v", err)
	}
	if cfg.Provider != "local" {
		t.Fatalf("expected default provider %q, got %q", "local", cfg.Provider)
	}
}

// ─── UserPreferencesStore ─────────────────────────────────────────────────────

func TestUserPreferencesStore_NilBeforeUpsert(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prefs-nil@example.com")

	store, err := NewUserPreferencesStore(database)
	if err != nil {
		t.Fatalf("NewUserPreferencesStore: %v", err)
	}

	prefs, err := store.Get(ctx, user.ID)
	if err != nil {
		t.Fatalf("Get before upsert: %v", err)
	}
	if prefs != nil {
		t.Fatal("expected nil prefs before first upsert")
	}
}

func TestUserPreferencesStore_UpsertAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prefs-upsert@example.com")

	store, err := NewUserPreferencesStore(database)
	if err != nil {
		t.Fatalf("NewUserPreferencesStore: %v", err)
	}

	prefs, err := store.Upsert(ctx, UpsertUserPreferencesParams{
		UserID:        user.ID,
		PreferredName: "Alice",
		Profession:    "Software Engineer",
		About:         "I build AI systems.",
		WorkingStyle:  "Deep work in the morning.",
		ResponseStyle: "Concise and to the point.",
		ExtraContext:  "Fluent in Go and TypeScript.",
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if prefs.PreferredName != "Alice" {
		t.Fatalf("expected preferred name %q, got %q", "Alice", prefs.PreferredName)
	}
	if prefs.Profession != "Software Engineer" {
		t.Fatalf("expected profession %q, got %q", "Software Engineer", prefs.Profession)
	}

	fetched, err := store.Get(ctx, user.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if fetched.About != "I build AI systems." {
		t.Fatalf("expected about %q, got %q", "I build AI systems.", fetched.About)
	}
}

func TestUserPreferencesStore_UpsertUpdates(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prefs-update@example.com")

	store, err := NewUserPreferencesStore(database)
	if err != nil {
		t.Fatalf("NewUserPreferencesStore: %v", err)
	}

	store.Upsert(ctx, UpsertUserPreferencesParams{UserID: user.ID, PreferredName: "Old Name"})
	updated, err := store.Upsert(ctx, UpsertUserPreferencesParams{UserID: user.ID, PreferredName: "New Name"})
	if err != nil {
		t.Fatalf("second Upsert: %v", err)
	}
	if updated.PreferredName != "New Name" {
		t.Fatalf("expected %q, got %q", "New Name", updated.PreferredName)
	}
}

func TestUserPreferencesStore_BuildSystemPromptBlock(t *testing.T) {
	prefs := &UserPreferences{
		PreferredName: "Bob",
		Profession:    "Data Scientist",
		ResponseStyle: "Bullet points preferred.",
	}
	block := prefs.BuildSystemPromptBlock()
	if !strings.Contains(block, "Bob") {
		t.Fatal("expected preferred name in prompt block")
	}
	if !strings.Contains(block, "Data Scientist") {
		t.Fatal("expected profession in prompt block")
	}
	if !strings.Contains(block, "Bullet points") {
		t.Fatal("expected response style in prompt block")
	}

	// Empty prefs — returns empty string
	empty := &UserPreferences{}
	if empty.BuildSystemPromptBlock() != "" {
		t.Fatal("expected empty prompt block for empty prefs")
	}
}

// ─── SearchProviderConfigStore ────────────────────────────────────────────────

func TestSearchProviderConfigStore_UpsertAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "spc-upsert@example.com")

	store, err := NewSearchProviderConfigStore(database)
	if err != nil {
		t.Fatalf("NewSearchProviderConfigStore: %v", err)
	}

	apiKey := "serper-api-key-xyz"
	cfg, err := store.Upsert(ctx, UpsertSearchProviderConfigParams{
		UserID:   user.ID,
		Provider: "serper",
		Enabled:  true,
		APIKey:   &apiKey,
		BaseURL:  "https://google.serper.dev",
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if cfg.Provider != "serper" {
		t.Fatalf("expected provider %q, got %q", "serper", cfg.Provider)
	}
	if !cfg.Enabled {
		t.Fatal("expected Enabled to be true")
	}
	if !cfg.HasAPIKey {
		t.Fatal("expected HasAPIKey to be true")
	}
	if cfg.BaseURL != "https://google.serper.dev" {
		t.Fatalf("expected base URL %q, got %q", "https://google.serper.dev", cfg.BaseURL)
	}

	fetched, err := store.GetByUserAndProvider(ctx, user.ID, "serper")
	if err != nil {
		t.Fatalf("GetByUserAndProvider: %v", err)
	}
	if fetched.UserID != user.ID {
		t.Fatalf("expected user ID %q, got %q", user.ID, fetched.UserID)
	}
}

func TestSearchProviderConfigStore_APIKeyRoundTrip(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "spc-encrypt@example.com")

	store, err := NewSearchProviderConfigStore(database)
	if err != nil {
		t.Fatalf("NewSearchProviderConfigStore: %v", err)
	}

	plainKey := "tavily-secret-api-key-12345"
	store.Upsert(ctx, UpsertSearchProviderConfigParams{
		UserID:   user.ID,
		Provider: "tavily",
		Enabled:  true,
		APIKey:   &plainKey,
	})

	decrypted, err := store.GetDecryptedAPIKey(ctx, user.ID, "tavily")
	if err != nil {
		t.Fatalf("GetDecryptedAPIKey: %v", err)
	}
	if decrypted != plainKey {
		t.Fatalf("expected %q, got %q", plainKey, decrypted)
	}
}

func TestSearchProviderConfigStore_ListByUser(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	userA := bootstrapTestUser(t, ctx, identityStore, "spc-listA@example.com")
	userB := bootstrapTestUser(t, ctx, identityStore, "spc-listB@example.com")

	store, err := NewSearchProviderConfigStore(database)
	if err != nil {
		t.Fatalf("NewSearchProviderConfigStore: %v", err)
	}

	store.Upsert(ctx, UpsertSearchProviderConfigParams{UserID: userA.ID, Provider: "serper"})
	store.Upsert(ctx, UpsertSearchProviderConfigParams{UserID: userA.ID, Provider: "tavily"})
	store.Upsert(ctx, UpsertSearchProviderConfigParams{UserID: userB.ID, Provider: "brave"})

	listA, err := store.ListByUserID(ctx, userA.ID)
	if err != nil {
		t.Fatalf("ListByUserID(A): %v", err)
	}
	if len(listA) != 2 {
		t.Fatalf("expected 2 configs for userA, got %d", len(listA))
	}

	listB, err := store.ListByUserID(ctx, userB.ID)
	if err != nil {
		t.Fatalf("ListByUserID(B): %v", err)
	}
	if len(listB) != 1 {
		t.Fatalf("expected 1 config for userB, got %d", len(listB))
	}
}

func TestSearchProviderConfigStore_Delete(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "spc-del@example.com")

	store, err := NewSearchProviderConfigStore(database)
	if err != nil {
		t.Fatalf("NewSearchProviderConfigStore: %v", err)
	}

	store.Upsert(ctx, UpsertSearchProviderConfigParams{UserID: user.ID, Provider: "serper", Enabled: true})

	if err := store.Delete(ctx, user.ID, "serper"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err = store.GetByUserAndProvider(ctx, user.ID, "serper")
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

func TestSearchProviderConfigStore_ProviderNormalized(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "spc-norm@example.com")

	store, err := NewSearchProviderConfigStore(database)
	if err != nil {
		t.Fatalf("NewSearchProviderConfigStore: %v", err)
	}

	// Insert with mixed case
	store.Upsert(ctx, UpsertSearchProviderConfigParams{UserID: user.ID, Provider: "SERPER"})

	// Retrieve with lowercase — should find it
	cfg, err := store.GetByUserAndProvider(ctx, user.ID, "serper")
	if err != nil {
		t.Fatalf("GetByUserAndProvider with lowercase: %v", err)
	}
	if cfg.Provider != "serper" {
		t.Fatalf("expected normalized provider %q, got %q", "serper", cfg.Provider)
	}
}

// ─── FileStore ────────────────────────────────────────────────────────────────

func TestFileStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "file-create@example.com")

	store, err := NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	f, err := store.Create(ctx, CreateFileParams{
		UserID:      user.ID,
		Filename:    "report.pdf",
		ContentType: "application/pdf",
		Size:        4096,
		StorageKey:  "uploads/report.pdf",
		SHA256:      "abc123",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if f.ID == "" {
		t.Fatal("expected non-empty file ID")
	}
	if f.Status != FileStatusActive {
		t.Fatalf("expected status %q, got %q", FileStatusActive, f.Status)
	}

	fetched, err := store.GetByID(ctx, f.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.Filename != "report.pdf" {
		t.Fatalf("expected filename %q, got %q", "report.pdf", fetched.Filename)
	}
	if fetched.Size != 4096 {
		t.Fatalf("expected size 4096, got %d", fetched.Size)
	}
}

func TestFileStore_ListByUser(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	userA := bootstrapTestUser(t, ctx, identityStore, "file-listA@example.com")
	userB := bootstrapTestUser(t, ctx, identityStore, "file-listB@example.com")

	store, err := NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	store.Create(ctx, CreateFileParams{UserID: userA.ID, Filename: "a1.txt", StorageKey: "k/a1"})
	store.Create(ctx, CreateFileParams{UserID: userA.ID, Filename: "a2.txt", StorageKey: "k/a2"})
	store.Create(ctx, CreateFileParams{UserID: userB.ID, Filename: "b1.txt", StorageKey: "k/b1"})

	filesA, err := store.ListByUserID(ctx, userA.ID)
	if err != nil {
		t.Fatalf("ListByUserID(A): %v", err)
	}
	if len(filesA) != 2 {
		t.Fatalf("expected 2 files for userA, got %d", len(filesA))
	}

	filesB, err := store.ListByUserID(ctx, userB.ID)
	if err != nil {
		t.Fatalf("ListByUserID(B): %v", err)
	}
	if len(filesB) != 1 {
		t.Fatalf("expected 1 file for userB, got %d", len(filesB))
	}
}

func TestFileStore_Delete(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "file-del@example.com")

	store, err := NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	f, _ := store.Create(ctx, CreateFileParams{
		UserID:     user.ID,
		Filename:   "to-delete.txt",
		StorageKey: "k/to-delete",
	})

	if err := store.Delete(ctx, f.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	files, err := store.ListByUserID(ctx, user.ID)
	if err != nil {
		t.Fatalf("ListByUserID after delete: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected 0 files after delete, got %d", len(files))
	}
}

func TestFileStore_NotFound(t *testing.T) {
	database := openTestDB(t)
	store, err := NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}

	_, err = store.GetByID(context.Background(), "nonexistent-file-id")
	if err == nil {
		t.Fatal("expected error for nonexistent file, got nil")
	}
}

// ─── CorpusStore ──────────────────────────────────────────────────────────────

func TestCorpusStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "corpus-create@example.com")

	store, err := NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}

	c, err := store.Create(ctx, CreateCorpusParams{
		UserID:      user.ID,
		Name:        "Research Docs",
		Description: "My research collection",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if c.ID == "" {
		t.Fatal("expected non-empty corpus ID")
	}

	fetched, err := store.GetByID(ctx, c.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.Name != "Research Docs" {
		t.Fatalf("expected name %q, got %q", "Research Docs", fetched.Name)
	}
	if fetched.UserID != user.ID {
		t.Fatalf("expected userID %q, got %q", user.ID, fetched.UserID)
	}
}

func TestCorpusStore_ListByUser(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	userA := bootstrapTestUser(t, ctx, identityStore, "corpus-listA@example.com")
	userB := bootstrapTestUser(t, ctx, identityStore, "corpus-listB@example.com")

	store, err := NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}

	store.Create(ctx, CreateCorpusParams{UserID: userA.ID, Name: "A1"})
	store.Create(ctx, CreateCorpusParams{UserID: userA.ID, Name: "A2"})
	store.Create(ctx, CreateCorpusParams{UserID: userB.ID, Name: "B1"})

	listA, err := store.ListByUserID(ctx, userA.ID)
	if err != nil {
		t.Fatalf("ListByUserID(A): %v", err)
	}
	if len(listA) != 2 {
		t.Fatalf("expected 2 corpora for userA, got %d", len(listA))
	}

	listB, err := store.ListByUserID(ctx, userB.ID)
	if err != nil {
		t.Fatalf("ListByUserID(B): %v", err)
	}
	if len(listB) != 1 {
		t.Fatalf("expected 1 corpus for userB, got %d", len(listB))
	}
}

func TestCorpusStore_FileOperations(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "corpus-files@example.com")

	store, err := NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}

	c, _ := store.Create(ctx, CreateCorpusParams{UserID: user.ID, Name: "Corpus"})

	// AddFile
	cf, err := store.AddFile(ctx, UpsertCorpusFileParams{
		CorpusID: c.ID,
		FileID:   "file-001",
		Filename: "doc.pdf",
	})
	if err != nil {
		t.Fatalf("AddFile: %v", err)
	}
	if cf.Status != CorpusFileStatusPending {
		t.Fatalf("expected status %q, got %q", CorpusFileStatusPending, cf.Status)
	}

	// ListFiles
	files, err := store.ListFiles(ctx, c.ID)
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 corpus file, got %d", len(files))
	}

	// UpdateFileStatus
	if err := store.UpdateFileStatus(ctx, c.ID, "file-001", CorpusFileStatusIngested, 42); err != nil {
		t.Fatalf("UpdateFileStatus: %v", err)
	}

	fetched, err := store.GetFile(ctx, c.ID, "file-001")
	if err != nil {
		t.Fatalf("GetFile: %v", err)
	}
	if fetched.Status != CorpusFileStatusIngested {
		t.Fatalf("expected status %q, got %q", CorpusFileStatusIngested, fetched.Status)
	}
	if fetched.ChunkCount != 42 {
		t.Fatalf("expected chunk count 42, got %d", fetched.ChunkCount)
	}
	if fetched.IngestedAt == nil {
		t.Fatal("expected IngestedAt to be set after ingestion")
	}

	// IncrementChunkCount
	if err := store.IncrementChunkCount(ctx, c.ID, 10); err != nil {
		t.Fatalf("IncrementChunkCount: %v", err)
	}
	updated, _ := store.GetByID(ctx, c.ID)
	if updated.ChunkCount != 10 {
		t.Fatalf("expected chunk count 10 after increment, got %d", updated.ChunkCount)
	}

	// RemoveFile
	if err := store.RemoveFile(ctx, c.ID, "file-001"); err != nil {
		t.Fatalf("RemoveFile: %v", err)
	}
	files, _ = store.ListFiles(ctx, c.ID)
	if len(files) != 0 {
		t.Fatalf("expected 0 files after remove, got %d", len(files))
	}
}

func TestCorpusStore_AddFile_Idempotent(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "corpus-idem@example.com")

	store, err := NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}

	c, _ := store.Create(ctx, CreateCorpusParams{UserID: user.ID, Name: "Idem"})

	store.AddFile(ctx, UpsertCorpusFileParams{CorpusID: c.ID, FileID: "dup-file", Filename: "dup.pdf"})
	if _, err := store.AddFile(ctx, UpsertCorpusFileParams{CorpusID: c.ID, FileID: "dup-file", Filename: "dup.pdf"}); err != nil {
		t.Fatalf("second AddFile for same file should not error: %v", err)
	}

	files, _ := store.ListFiles(ctx, c.ID)
	if len(files) != 1 {
		t.Fatalf("expected 1 file after duplicate AddFile, got %d", len(files))
	}
}

// ─── KnowledgeIngestionJobStore ───────────────────────────────────────────────

func TestIngestionJobStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ing-create@example.com")

	store, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	job, err := store.Create(ctx, CreateKnowledgeIngestionJobParams{
		CorpusID: "corp-001",
		FileID:   "file-001",
		UserID:   user.ID,
		Filename: "doc.pdf",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if job.ID == "" {
		t.Fatal("expected non-empty job ID")
	}
	if job.Status != IngestionJobStatusPending {
		t.Fatalf("expected status %q, got %q", IngestionJobStatusPending, job.Status)
	}
	if job.MaxAttempts != 3 {
		t.Fatalf("expected MaxAttempts 3, got %d", job.MaxAttempts)
	}

	fetched, err := store.GetByID(ctx, job.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.CorpusID != "corp-001" {
		t.Fatalf("expected CorpusID %q, got %q", "corp-001", fetched.CorpusID)
	}
}

func TestIngestionJobStore_MarkCompleted(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ing-done@example.com")

	store, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	job, _ := store.Create(ctx, CreateKnowledgeIngestionJobParams{
		CorpusID: "corp-c",
		FileID:   "file-c",
		UserID:   user.ID,
	})

	if err := store.MarkCompleted(ctx, job.ID, 100); err != nil {
		t.Fatalf("MarkCompleted: %v", err)
	}

	fetched, _ := store.GetByID(ctx, job.ID)
	if fetched.Status != IngestionJobStatusCompleted {
		t.Fatalf("expected status %q, got %q", IngestionJobStatusCompleted, fetched.Status)
	}
	if fetched.ChunkCount != 100 {
		t.Fatalf("expected chunk count 100, got %d", fetched.ChunkCount)
	}
}

func TestIngestionJobStore_MarkSkipped(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ing-skip@example.com")

	store, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	job, _ := store.Create(ctx, CreateKnowledgeIngestionJobParams{
		CorpusID: "corp-s",
		FileID:   "file-s",
		UserID:   user.ID,
	})

	if err := store.MarkSkipped(ctx, job.ID, "corpus file detached before ingestion"); err != nil {
		t.Fatalf("MarkSkipped: %v", err)
	}

	fetched, _ := store.GetByID(ctx, job.ID)
	if fetched.Status != IngestionJobStatusSkipped {
		t.Fatalf("expected status %q, got %q", IngestionJobStatusSkipped, fetched.Status)
	}
	if fetched.ChunkCount != 0 {
		t.Fatalf("expected chunk count 0, got %d", fetched.ChunkCount)
	}
	if fetched.LastError != "corpus file detached before ingestion" {
		t.Fatalf("expected skip reason to be preserved, got %q", fetched.LastError)
	}
}

func TestIngestionJobStore_MarkFailed_AndRetry(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ing-fail@example.com")

	store, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	job, _ := store.Create(ctx, CreateKnowledgeIngestionJobParams{
		CorpusID:    "corp-f",
		FileID:      "file-f",
		UserID:      user.ID,
		MaxAttempts: 2,
	})

	// First failure — should stay pending (attempt_count < max_attempts)
	simErr := fmt.Errorf("timeout connecting to vectorDB")
	job.AttemptCount = 1
	if err := store.MarkFailed(ctx, *job, simErr, 0); err != nil {
		t.Fatalf("MarkFailed: %v", err)
	}

	fetched, _ := store.GetByID(ctx, job.ID)
	if fetched.Status != IngestionJobStatusPending {
		t.Fatalf("expected status %q after first failure, got %q", IngestionJobStatusPending, fetched.Status)
	}
	if fetched.LastError == "" {
		t.Fatal("expected non-empty LastError after failure")
	}

	// ResetForRetry
	reset, err := store.ResetForRetry(ctx, job.ID)
	if err != nil {
		t.Fatalf("ResetForRetry: %v", err)
	}
	if reset.AttemptCount != 0 {
		t.Fatalf("expected AttemptCount 0 after reset, got %d", reset.AttemptCount)
	}
}

func TestIngestionJobStore_ClaimNextDue(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ing-claim@example.com")

	store, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}

	store.Create(ctx, CreateKnowledgeIngestionJobParams{
		CorpusID: "corp-cl",
		FileID:   "file-cl",
		UserID:   user.ID,
	})

	claimed, err := store.ClaimNextDue(ctx, 0)
	if err != nil {
		t.Fatalf("ClaimNextDue: %v", err)
	}
	if claimed == nil {
		t.Fatal("expected a job to be claimed")
	}
	if claimed.Status != IngestionJobStatusRunning {
		t.Fatalf("expected status %q after claim, got %q", IngestionJobStatusRunning, claimed.Status)
	}
	if claimed.AttemptCount != 1 {
		t.Fatalf("expected AttemptCount 1 after claim, got %d", claimed.AttemptCount)
	}

	// No more jobs to claim
	second, err := store.ClaimNextDue(ctx, 0)
	if err != nil {
		t.Fatalf("second ClaimNextDue: %v", err)
	}
	if second != nil {
		t.Fatalf("expected nil for empty queue, got job %q", second.ID)
	}
}

func TestIdentityStoreBootstrapTenancyAndAuthFoundation(t *testing.T) {
	database, err := Open(context.Background(), DefaultSQLiteConfig(filepath.Join(t.TempDir(), "foundation.db")))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer database.Close()

	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	result, err := store.EnsureBootstrap(context.Background(), BootstrapOptions{
		AdminEmail:           "root@example.com",
		AdminDisplayName:     "Root",
		AdminPasswordHash:    "hashed-password",
		DefaultOrgName:       "Acme",
		DefaultOrgSlug:       "acme",
		DefaultWorkspaceName: "Core",
		DefaultWorkspaceSlug: "core",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap failed: %v", err)
	}
	if result.AdminUser == nil || result.Organization == nil || result.Workspace == nil {
		t.Fatalf("expected bootstrap result to include admin user, org, workspace; got %#v", result)
	}

	members, err := store.ListWorkspaceMembers(context.Background(), result.Workspace.ID)
	if err != nil {
		t.Fatalf("ListWorkspaceMembers failed: %v", err)
	}
	if len(members) != 1 || members[0].RoleName != "admin" {
		t.Fatalf("expected bootstrap admin workspace membership, got %#v", members)
	}

	authSession, err := store.CreateAuthSession(context.Background(), CreateAuthSessionParams{
		UserID:         result.AdminUser.ID,
		PlaintextToken: "plain-token",
		ExpiresAt:      time.Now().UTC().Add(24 * time.Hour),
		Metadata: map[string]any{
			"kind": "api",
		},
	})
	if err != nil {
		t.Fatalf("CreateAuthSession failed: %v", err)
	}
	if authSession.TokenHash == "plain-token" || authSession.TokenHash == "" {
		t.Fatalf("expected token to be stored hashed, got %q", authSession.TokenHash)
	}

	loadedSession, err := store.GetAuthSessionByToken(context.Background(), "plain-token")
	if err != nil {
		t.Fatalf("GetAuthSessionByToken failed: %v", err)
	}
	if loadedSession.ID != authSession.ID {
		t.Fatalf("expected loaded auth session %q, got %q", authSession.ID, loadedSession.ID)
	}

	if err := store.TouchAuthSession(context.Background(), authSession.ID, 30*24*time.Hour); err != nil {
		t.Fatalf("TouchAuthSession failed: %v", err)
	}
	touchedSession, err := store.GetAuthSessionByToken(context.Background(), "plain-token")
	if err != nil {
		t.Fatalf("GetAuthSessionByToken after touch failed: %v", err)
	}
	if touchedSession.LastUsedAt == nil {
		t.Fatal("expected last used timestamp to be set after touch")
	}
	if !touchedSession.ExpiresAt.After(authSession.ExpiresAt) {
		t.Fatal("expected expiry to be extended after touch with non-zero extendBy")
	}

	if err := store.RevokeAuthSession(context.Background(), authSession.ID); err != nil {
		t.Fatalf("RevokeAuthSession failed: %v", err)
	}
	revokedSession, err := store.GetAuthSessionByToken(context.Background(), "plain-token")
	if err != nil {
		t.Fatalf("GetAuthSessionByToken after revoke failed: %v", err)
	}
	if revokedSession.Status != AuthSessionStatusRevoked {
		t.Fatalf("expected revoked auth session status %q, got %q", AuthSessionStatusRevoked, revokedSession.Status)
	}
}

// ─── Multi-driver test helpers ────────────────────────────────────────────────

func openTestDB(t *testing.T) *DB {
	t.Helper()
	return openSQLiteTestDB(t)
}

func openSQLiteTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(context.Background(), DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("Open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func openPostgresTestDB(t *testing.T) *DB {
	t.Helper()
	dsn := os.Getenv("SESHAT_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("SESHAT_TEST_POSTGRES_DSN not set")
	}
	db, err := Open(context.Background(), DefaultPostgresConfig(dsn))
	if err != nil {
		t.Fatalf("Open postgres: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func openMySQLTestDB(t *testing.T) *DB {
	t.Helper()
	dsn := os.Getenv("SESHAT_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("SESHAT_TEST_MYSQL_DSN not set")
	}
	db, err := Open(context.Background(), DefaultMySQLConfig(dsn))
	if err != nil {
		t.Fatalf("Open mysql: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func runBootstrapSuite(t *testing.T, database *DB) {
	t.Helper()

	applied, err := listAppliedMigrations(context.Background(), database, migrationScopeBackend)
	if err != nil {
		t.Fatalf("listAppliedMigrations: %v", err)
	}
	if len(applied) < 2 {
		t.Fatalf("expected backend migrations to be recorded, got %v", applied)
	}

	store, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	result, err := store.EnsureBootstrap(context.Background(), BootstrapOptions{
		AdminEmail:           "multidriver@example.com",
		AdminDisplayName:     "MultiDriver Admin",
		AdminPasswordHash:    "hash-for-test",
		DefaultOrgName:       "TestOrg",
		DefaultOrgSlug:       "testorg",
		DefaultWorkspaceName: "TestWS",
		DefaultWorkspaceSlug: "testws",
	})
	if err != nil {
		t.Fatalf("EnsureBootstrap: %v", err)
	}
	if result.AdminUser == nil || result.Organization == nil || result.Workspace == nil {
		t.Fatal("expected non-nil bootstrap result fields")
	}

	roles, err := store.ListRoles(context.Background())
	if err != nil {
		t.Fatalf("ListRoles: %v", err)
	}
	if len(roles) < 3 {
		t.Fatalf("expected at least 3 seeded roles, got %d", len(roles))
	}

	fileStore, err := NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	f, err := fileStore.Create(context.Background(), CreateFileParams{
		UserID:     result.AdminUser.ID,
		Filename:   "test.txt",
		StorageKey: "test/test.txt",
	})
	if err != nil {
		t.Fatalf("Create file: %v", err)
	}
	if f.ID == "" {
		t.Fatal("expected non-empty file ID")
	}
}

func TestWithPostgres(t *testing.T) {
	db := openPostgresTestDB(t)
	runBootstrapSuite(t, db)
}

func TestWithMySQL(t *testing.T) {
	db := openMySQLTestDB(t)
	runBootstrapSuite(t, db)
}

func TestIdentityStoreSeedsRolesAndAssignsUserRole(t *testing.T) {
	database, err := Open(context.Background(), DefaultSQLiteConfig(filepath.Join(t.TempDir(), "identity.db")))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer database.Close()

	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore failed: %v", err)
	}

	roles, err := identityStore.ListRoles(context.Background())
	if err != nil {
		t.Fatalf("ListRoles failed: %v", err)
	}
	if len(roles) < 3 {
		t.Fatalf("expected seeded system roles, got %d", len(roles))
	}

	user, err := identityStore.CreateUser(context.Background(), CreateUserParams{
		Email:       "alice@example.com",
		DisplayName: "Alice",
		Metadata: map[string]any{
			"source": "test",
		},
	})
	if err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}
	if user.ID == "" {
		t.Fatal("expected created user ID")
	}
	if user.Status != UserStatusActive {
		t.Fatalf("expected default user status %q, got %q", UserStatusActive, user.Status)
	}

	if err := identityStore.AssignRoleToUser(context.Background(), user.ID, "member"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}
	if err := identityStore.AssignRoleToUser(context.Background(), user.ID, "admin"); err != nil {
		t.Fatalf("AssignRoleToUser failed: %v", err)
	}

	loadedUser, err := identityStore.GetUserByEmail(context.Background(), "Alice@Example.com")
	if err != nil {
		t.Fatalf("GetUserByEmail failed: %v", err)
	}
	if loadedUser.Email != "alice@example.com" {
		t.Fatalf("expected normalized email %q, got %q", "alice@example.com", loadedUser.Email)
	}

	userRoles, err := identityStore.ListUserRoles(context.Background(), user.ID)
	if err != nil {
		t.Fatalf("ListUserRoles failed: %v", err)
	}
	if len(userRoles) != 2 {
		t.Fatalf("expected 2 assigned roles, got %d", len(userRoles))
	}
	if userRoles[0].Name != "admin" || userRoles[1].Name != "member" {
		t.Fatalf("expected roles [admin member], got %#v", userRoles)
	}
}

func TestMCPServerStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}

	ctx := context.Background()

	srv, err := store.Create(ctx, CreateMCPServerParams{
		Name:        "my-mcp-server",
		DisplayName: "My MCP Server",
		ServerType:  "stdio",
		Command:     "/usr/bin/mcp-server",
		Args:        []string{"--port", "8080"},
		Env:         map[string]string{"ENV": "production"},
		TimeoutSecs: 60,
		Icon:        "🔧",
		Enabled:     true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if srv.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if srv.Name != "my-mcp-server" {
		t.Fatalf("expected name %q, got %q", "my-mcp-server", srv.Name)
	}
	if len(srv.Args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(srv.Args))
	}
	if srv.Env["ENV"] != "production" {
		t.Fatalf("expected env ENV=production, got %q", srv.Env["ENV"])
	}
	if srv.TimeoutSecs != 60 {
		t.Fatalf("expected timeout 60, got %d", srv.TimeoutSecs)
	}

	fetched, err := store.GetByID(ctx, srv.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.DisplayName != "My MCP Server" {
		t.Fatalf("expected display name %q, got %q", "My MCP Server", fetched.DisplayName)
	}
}

func TestMCPServerStore_List(t *testing.T) {
	database := openTestDB(t)
	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}

	ctx := context.Background()

	store.Create(ctx, CreateMCPServerParams{Name: "s1", Enabled: true})
	store.Create(ctx, CreateMCPServerParams{Name: "s2", Enabled: false})
	store.Create(ctx, CreateMCPServerParams{Name: "s3", Enabled: true})

	all, err := store.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) < 3 {
		t.Fatalf("expected at least 3 servers, got %d", len(all))
	}

	enabled, err := store.ListEnabled(ctx)
	if err != nil {
		t.Fatalf("ListEnabled: %v", err)
	}
	for _, s := range enabled {
		if !s.Enabled {
			t.Fatalf("ListEnabled returned disabled server %q", s.Name)
		}
	}
}

func TestMCPServerStore_Update(t *testing.T) {
	database := openTestDB(t)
	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}

	ctx := context.Background()

	srv, _ := store.Create(ctx, CreateMCPServerParams{
		Name:    "upd-server",
		Command: "/old/cmd",
		Enabled: true,
	})

	newCmd := "/new/cmd"
	newTimeout := 120
	disabled := false
	updated, err := store.Update(ctx, srv.ID, UpdateMCPServerParams{
		Command:     &newCmd,
		TimeoutSecs: &newTimeout,
		Enabled:     &disabled,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Command != "/new/cmd" {
		t.Fatalf("expected command %q, got %q", "/new/cmd", updated.Command)
	}
	if updated.TimeoutSecs != 120 {
		t.Fatalf("expected timeout 120, got %d", updated.TimeoutSecs)
	}
	if updated.Enabled {
		t.Fatal("expected Enabled to be false after update")
	}
}

func TestMCPServerStore_Delete(t *testing.T) {
	database := openTestDB(t)
	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}

	ctx := context.Background()

	srv, _ := store.Create(ctx, CreateMCPServerParams{Name: "del-server"})

	if err := store.Delete(ctx, srv.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err = store.GetByID(ctx, srv.ID)
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

func TestMCPServerStore_DefaultsApplied(t *testing.T) {
	database := openTestDB(t)
	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}

	ctx := context.Background()

	// Create with minimal params — check defaults
	srv, err := store.Create(ctx, CreateMCPServerParams{Name: "minimal-server"})
	if err != nil {
		t.Fatalf("Create minimal: %v", err)
	}
	if srv.ServerType != "stdio" {
		t.Fatalf("expected default server_type %q, got %q", "stdio", srv.ServerType)
	}
	if srv.TimeoutSecs != 30 {
		t.Fatalf("expected default timeout 30, got %d", srv.TimeoutSecs)
	}
	if srv.Icon == "" {
		t.Fatal("expected non-empty default icon")
	}
	if srv.Source != "db" {
		t.Fatalf("expected source %q, got %q", "db", srv.Source)
	}
}

func TestMCPServerStore_EncryptsSecretsAtRest(t *testing.T) {
	database := openTestDB(t)
	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}

	ctx := context.Background()
	srv, err := store.Create(ctx, CreateMCPServerParams{
		Name:    "secure-server",
		Env:     map[string]string{"API_KEY": "super-secret", "PLAIN": "visible"},
		Headers: map[string]string{"Authorization": "Bearer token"},
		Enabled: true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	var row gMCPServer
	if err := database.GormDB().WithContext(ctx).Where("id = ?", srv.ID).First(&row).Error; err != nil {
		t.Fatalf("load raw row: %v", err)
	}
	if strings.Contains(row.EnvJSON, "super-secret") || strings.Contains(row.EnvJSON, "visible") {
		t.Fatalf("expected env_json to be encrypted, got %q", row.EnvJSON)
	}
	if strings.Contains(row.HeadersJSON, "Bearer token") {
		t.Fatalf("expected headers_json to be encrypted, got %q", row.HeadersJSON)
	}

	fetched, err := store.GetByID(ctx, srv.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.Env["API_KEY"] != "super-secret" || fetched.Env["PLAIN"] != "visible" {
		t.Fatalf("unexpected decrypted env: %#v", fetched.Env)
	}
	if fetched.Headers["Authorization"] != "Bearer token" {
		t.Fatalf("unexpected decrypted headers: %#v", fetched.Headers)
	}
}

func TestMCPServerStore_ReadsLegacyPlainJSONSecrets(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	row := gMCPServer{
		ID:            "mcp_legacy",
		Name:          "legacy-server",
		DisplayName:   "Legacy Server",
		ServerType:    "http",
		EnvJSON:       `{"API_KEY":"legacy-secret"}`,
		HeadersJSON:   `{"Authorization":"Bearer legacy"}`,
		TimeoutSecs:   30,
		Enabled:       true,
		Source:        "db",
		CreatedAtUnix: 1,
		UpdatedAtUnix: 1,
	}
	if err := database.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	store, err := NewMCPServerStore(database)
	if err != nil {
		t.Fatalf("NewMCPServerStore: %v", err)
	}
	fetched, err := store.GetByID(ctx, row.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.Env["API_KEY"] != "legacy-secret" {
		t.Fatalf("expected legacy env secret, got %#v", fetched.Env)
	}
	if fetched.Headers["Authorization"] != "Bearer legacy" {
		t.Fatalf("expected legacy header secret, got %#v", fetched.Headers)
	}
}

func TestMCPServerSecretMigrationEncryptsLegacyRows(t *testing.T) {
	database := openTestDB(t)
	ctx := context.Background()
	row := gMCPServer{
		ID:            "mcp_migrate",
		Name:          "migrate-server",
		DisplayName:   "Migrate Server",
		ServerType:    "http",
		EnvJSON:       `{"TOKEN":"legacy-token"}`,
		HeadersJSON:   `{"Authorization":"Bearer legacy"}`,
		TimeoutSecs:   30,
		Enabled:       true,
		Source:        "db",
		CreatedAtUnix: 1,
		UpdatedAtUnix: 1,
	}
	if err := database.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	if err := migrateMCPServerSecretEncryption(ctx, database); err != nil {
		t.Fatalf("migrateMCPServerSecretEncryption: %v", err)
	}

	var migrated gMCPServer
	if err := database.GormDB().WithContext(ctx).Where("id = ?", row.ID).First(&migrated).Error; err != nil {
		t.Fatalf("reload migrated row: %v", err)
	}
	if strings.Contains(migrated.EnvJSON, "legacy-token") || strings.Contains(migrated.HeadersJSON, "Bearer legacy") {
		t.Fatalf("expected migrated row secrets to be encrypted, got env=%q headers=%q", migrated.EnvJSON, migrated.HeadersJSON)
	}
}

// ─── ProviderModelStore ───────────────────────────────────────────────────────

func TestProviderModelStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "pm-create@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "OpenAI",
	})

	store, err := NewProviderModelStore(database)
	if err != nil {
		t.Fatalf("NewProviderModelStore: %v", err)
	}

	pm, err := store.Create(ctx, CreateProviderModelParams{
		ProviderSettingID: ps.ID,
		ModelID:           "gpt-4o",
		DisplayName:       "GPT-4o",
		ContextWindow:     128000,
		MaxOutput:         4096,
		IsDefault:         true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if pm.ID == "" {
		t.Fatal("expected non-empty model ID")
	}
	if pm.Source != "user" {
		t.Fatalf("expected default source %q, got %q", "user", pm.Source)
	}

	fetched, err := store.GetByID(ctx, pm.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.ModelID != "gpt-4o" {
		t.Fatalf("expected model ID %q, got %q", "gpt-4o", fetched.ModelID)
	}
	if fetched.ContextWindow != 128000 {
		t.Fatalf("expected context window 128000, got %d", fetched.ContextWindow)
	}
}

func TestProviderModelStore_ListBySettingID(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "pm-list@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "anthropic",
		Name:     "Anthropic",
	})

	store, err := NewProviderModelStore(database)
	if err != nil {
		t.Fatalf("NewProviderModelStore: %v", err)
	}

	store.Create(ctx, CreateProviderModelParams{ProviderSettingID: ps.ID, ModelID: "claude-opus-4"})
	store.Create(ctx, CreateProviderModelParams{ProviderSettingID: ps.ID, ModelID: "claude-sonnet-4"})
	store.Create(ctx, CreateProviderModelParams{ProviderSettingID: ps.ID, ModelID: "claude-haiku-4"})

	models, err := store.ListBySettingID(ctx, ps.ID)
	if err != nil {
		t.Fatalf("ListBySettingID: %v", err)
	}
	if len(models) != 3 {
		t.Fatalf("expected 3 models, got %d", len(models))
	}
}

func TestProviderModelStore_Update(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "pm-upd@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "OAI",
	})

	store, err := NewProviderModelStore(database)
	if err != nil {
		t.Fatalf("NewProviderModelStore: %v", err)
	}

	pm, _ := store.Create(ctx, CreateProviderModelParams{
		ProviderSettingID: ps.ID,
		ModelID:           "gpt-3.5",
		DisplayName:       "Old Name",
	})

	newName := "GPT-3.5 Turbo"
	newCtx := 16385
	updated, err := store.Update(ctx, pm.ID, UpdateProviderModelParams{
		DisplayName:   &newName,
		ContextWindow: &newCtx,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.DisplayName != "GPT-3.5 Turbo" {
		t.Fatalf("expected display name %q, got %q", "GPT-3.5 Turbo", updated.DisplayName)
	}
	if updated.ContextWindow != 16385 {
		t.Fatalf("expected context window 16385, got %d", updated.ContextWindow)
	}
}

func TestProviderModelStore_Delete(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "pm-del@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "OAI",
	})

	store, err := NewProviderModelStore(database)
	if err != nil {
		t.Fatalf("NewProviderModelStore: %v", err)
	}

	pm, _ := store.Create(ctx, CreateProviderModelParams{
		ProviderSettingID: ps.ID,
		ModelID:           "to-delete",
	})

	if err := store.Delete(ctx, pm.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	models, _ := store.ListBySettingID(ctx, ps.ID)
	if len(models) != 0 {
		t.Fatalf("expected 0 models after delete, got %d", len(models))
	}
}

func TestProviderModelStore_BulkReplaceCatalog(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "pm-bulk@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "OAI",
	})

	store, err := NewProviderModelStore(database)
	if err != nil {
		t.Fatalf("NewProviderModelStore: %v", err)
	}

	// Create a user-added model — must survive bulk replace
	store.Create(ctx, CreateProviderModelParams{
		ProviderSettingID: ps.ID,
		ModelID:           "user-custom-model",
		Source:            "user",
	})

	// Bulk replace catalog models
	catalogParams := []CreateProviderModelParams{
		{ProviderSettingID: ps.ID, ModelID: "gpt-4o", Source: "catalog"},
		{ProviderSettingID: ps.ID, ModelID: "gpt-4o-mini", Source: "catalog"},
	}
	all, err := store.BulkReplaceCatalog(ctx, ps.ID, catalogParams)
	if err != nil {
		t.Fatalf("BulkReplaceCatalog: %v", err)
	}

	// Should have 3 total: 2 catalog + 1 user-added
	if len(all) != 3 {
		t.Fatalf("expected 3 models (2 catalog + 1 user), got %d", len(all))
	}

	// Verify user model survived
	found := false
	for _, m := range all {
		if m.ModelID == "user-custom-model" {
			found = true
		}
	}
	if !found {
		t.Fatal("user-added model should survive BulkReplaceCatalog")
	}
}

// ─── ProviderOAuthConnectionStore ────────────────────────────────────────────

func TestProviderOAuthConnectionStore_UpsertPendingAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "oauth-pending@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "google",
		Name:     "Google",
		AuthKind: "oauth",
	})

	store, err := NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}

	expires := time.Now().UTC().Add(5 * time.Minute)
	conn, err := store.UpsertPending(ctx, UpsertProviderOAuthPendingParams{
		SettingID:       ps.ID,
		UserID:          user.ID,
		Provider:        "google",
		Status:          "pending",
		DeviceCode:      "dc-super-secret",
		UserCode:        "USER-CODE-123",
		VerificationURL: "https://accounts.google.com/device",
		ExpiresAt:       expires,
	})
	if err != nil {
		t.Fatalf("UpsertPending: %v", err)
	}
	if conn.SettingID != ps.ID {
		t.Fatalf("expected setting ID %q, got %q", ps.ID, conn.SettingID)
	}
	if conn.Status != "pending" {
		t.Fatalf("expected status %q, got %q", "pending", conn.Status)
	}
	if conn.PendingUserCode != "USER-CODE-123" {
		t.Fatalf("expected user code %q, got %q", "USER-CODE-123", conn.PendingUserCode)
	}

	fetched, err := store.GetBySettingID(ctx, ps.ID)
	if err != nil {
		t.Fatalf("GetBySettingID: %v", err)
	}
	if fetched.PendingVerificationURL != "https://accounts.google.com/device" {
		t.Fatalf("expected verification URL, got %q", fetched.PendingVerificationURL)
	}
}

func TestProviderOAuthConnectionStore_GetSecret(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "oauth-secret@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "google",
		Name:     "Google",
		AuthKind: "oauth",
	})

	store, err := NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}

	store.UpsertPending(ctx, UpsertProviderOAuthPendingParams{
		SettingID:  ps.ID,
		UserID:     user.ID,
		Provider:   "google",
		DeviceCode: "secret-device-code-xyz",
	})

	secret, err := store.GetSecret(ctx, ps.ID)
	if err != nil {
		t.Fatalf("GetSecret: %v", err)
	}
	if secret.PendingDeviceCode != "secret-device-code-xyz" {
		t.Fatalf("expected decrypted device code, got %q", secret.PendingDeviceCode)
	}
}

func TestProviderOAuthConnectionStore_UpdateConnected(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "oauth-connect@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "google",
		Name:     "Google",
		AuthKind: "oauth",
	})

	store, err := NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}

	store.UpsertPending(ctx, UpsertProviderOAuthPendingParams{
		SettingID: ps.ID,
		UserID:    user.ID,
		Provider:  "google",
	})

	connected, err := store.UpdateConnected(ctx, UpdateProviderOAuthConnectedParams{
		SettingID:        ps.ID,
		Status:           "connected",
		AccessToken:      "at-secret-token",
		RefreshToken:     "rt-secret-token",
		AccountEmail:     "user@gmail.com",
		ExpiresAt:        time.Now().UTC().Add(time.Hour),
		ClearPendingFlow: true,
	})
	if err != nil {
		t.Fatalf("UpdateConnected: %v", err)
	}
	if connected.Status != "connected" {
		t.Fatalf("expected status %q, got %q", "connected", connected.Status)
	}
	if !connected.HasRefreshToken {
		t.Fatal("expected HasRefreshToken to be true")
	}
	if connected.AccountEmail != "user@gmail.com" {
		t.Fatalf("expected account email %q, got %q", "user@gmail.com", connected.AccountEmail)
	}
	if connected.PendingUserCode != "" {
		t.Fatal("expected pending user code to be cleared")
	}

	// Verify encrypted tokens round-trip
	secret, err := store.GetSecret(ctx, ps.ID)
	if err != nil {
		t.Fatalf("GetSecret after connected: %v", err)
	}
	if secret.AccessToken != "at-secret-token" {
		t.Fatalf("expected access token round-trip, got %q", secret.AccessToken)
	}
	if secret.RefreshToken != "rt-secret-token" {
		t.Fatalf("expected refresh token round-trip, got %q", secret.RefreshToken)
	}
}

func TestProviderOAuthConnectionStore_ListBySettingIDs(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "oauth-list@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	store, err := NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}

	ps1, _ := psStore.Create(ctx, CreateProviderSettingParams{UserID: user.ID, Provider: "google", Name: "G1", AuthKind: "oauth"})
	ps2, _ := psStore.Create(ctx, CreateProviderSettingParams{UserID: user.ID, Provider: "github", Name: "GH1", AuthKind: "oauth"})

	store.UpsertPending(ctx, UpsertProviderOAuthPendingParams{SettingID: ps1.ID, UserID: user.ID, Provider: "google"})
	store.UpsertPending(ctx, UpsertProviderOAuthPendingParams{SettingID: ps2.ID, UserID: user.ID, Provider: "github"})

	conns, err := store.ListBySettingIDs(ctx, []string{ps1.ID, ps2.ID})
	if err != nil {
		t.Fatalf("ListBySettingIDs: %v", err)
	}
	if len(conns) != 2 {
		t.Fatalf("expected 2 connections, got %d", len(conns))
	}
	if _, ok := conns[ps1.ID]; !ok {
		t.Fatalf("expected connection for setting %q", ps1.ID)
	}
}

func TestProviderOAuthConnectionStore_Delete(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "oauth-del@example.com")

	psStore, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}
	ps, _ := psStore.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "google",
		Name:     "Google",
		AuthKind: "oauth",
	})

	store, err := NewProviderOAuthConnectionStore(database)
	if err != nil {
		t.Fatalf("NewProviderOAuthConnectionStore: %v", err)
	}

	store.UpsertPending(ctx, UpsertProviderOAuthPendingParams{
		SettingID: ps.ID,
		UserID:    user.ID,
		Provider:  "google",
	})

	if err := store.DeleteBySettingID(ctx, ps.ID); err != nil {
		t.Fatalf("DeleteBySettingID: %v", err)
	}

	_, err = store.GetBySettingID(ctx, ps.ID)
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

func TestProviderSettingStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prov-create@example.com")

	store, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	ps, err := store.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "My OpenAI",
		AuthKind: "api_key",
		ModelID:  "gpt-4o",
		APIKey:   "sk-test-12345",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if ps.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if !ps.HasAPIKey {
		t.Fatal("expected HasAPIKey to be true after creation with API key")
	}

	fetched, err := store.GetByID(ctx, ps.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.Provider != "openai" {
		t.Fatalf("expected provider %q, got %q", "openai", fetched.Provider)
	}
}

func TestProviderSettingStore_APIKeyEncryptionRoundTrip(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prov-enc@example.com")

	store, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	plainKey := "sk-super-secret-key-abcdef123456"
	ps, _ := store.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "anthropic",
		Name:     "Anthropic",
		APIKey:   plainKey,
	})

	decrypted, err := store.GetDecryptedAPIKey(ctx, ps.ID)
	if err != nil {
		t.Fatalf("GetDecryptedAPIKey: %v", err)
	}
	if decrypted != plainKey {
		t.Fatalf("expected %q, got %q", plainKey, decrypted)
	}
}

func TestProviderSettingStore_ListByUser(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	userA := bootstrapTestUser(t, ctx, identityStore, "prov-listA@example.com")
	userB := bootstrapTestUser(t, ctx, identityStore, "prov-listB@example.com")

	store, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	store.Create(ctx, CreateProviderSettingParams{UserID: userA.ID, Provider: "openai", Name: "OA1"})
	store.Create(ctx, CreateProviderSettingParams{UserID: userA.ID, Provider: "anthropic", Name: "AN1"})
	store.Create(ctx, CreateProviderSettingParams{UserID: userB.ID, Provider: "ollama", Name: "OL1"})

	listA, err := store.ListByUserID(ctx, userA.ID)
	if err != nil {
		t.Fatalf("ListByUserID(A): %v", err)
	}
	if len(listA) != 2 {
		t.Fatalf("expected 2 settings for userA, got %d", len(listA))
	}

	listB, err := store.ListByUserID(ctx, userB.ID)
	if err != nil {
		t.Fatalf("ListByUserID(B): %v", err)
	}
	if len(listB) != 1 {
		t.Fatalf("expected 1 setting for userB, got %d", len(listB))
	}
}

func TestProviderSettingStore_Update(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prov-update@example.com")

	store, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	ps, _ := store.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "Old Name",
		ModelID:  "gpt-3.5",
	})

	newName := "New Name"
	newModel := "gpt-4o"
	updated, err := store.Update(ctx, ps.ID, UpdateProviderSettingParams{
		Name:    &newName,
		ModelID: &newModel,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "New Name" {
		t.Fatalf("expected name %q, got %q", "New Name", updated.Name)
	}
	if updated.ModelID != "gpt-4o" {
		t.Fatalf("expected model %q, got %q", "gpt-4o", updated.ModelID)
	}
}

func TestProviderSettingStore_Delete(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prov-del@example.com")

	store, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	ps, _ := store.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "openai",
		Name:     "To delete",
	})

	if err := store.Delete(ctx, ps.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err = store.GetByID(ctx, ps.ID)
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

func TestProviderSettingStore_CreateWithoutAPIKey(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "prov-nokey@example.com")

	store, err := NewProviderSettingStore(database)
	if err != nil {
		t.Fatalf("NewProviderSettingStore: %v", err)
	}

	// OAuth provider — no API key.
	ps, err := store.Create(ctx, CreateProviderSettingParams{
		UserID:   user.ID,
		Provider: "google",
		Name:     "Gemini OAuth",
		AuthKind: "oauth",
	})
	if err != nil {
		t.Fatalf("Create without API key: %v", err)
	}
	if ps.HasAPIKey {
		t.Fatal("expected HasAPIKey to be false for OAuth provider without key")
	}
}

// ─── UsageCounterStore ────────────────────────────────────────────────────────

func TestUsageCounterStore_IncrementAndGet(t *testing.T) {
	database := openTestDB(t)
	store, err := NewUsageCounterStore(database)
	if err != nil {
		t.Fatalf("NewUsageCounterStore: %v", err)
	}

	ctx := context.Background()
	userID := "usage-user-001"
	metric := "tokens_in"
	period := DayPeriodKey(time.Now())

	// Zero before any increment
	count, err := store.Get(ctx, userID, metric, period)
	if err != nil {
		t.Fatalf("Get (initial): %v", err)
	}
	if count != 0 {
		t.Fatalf("expected 0 before increment, got %d", count)
	}

	if err := store.Increment(ctx, userID, metric, period, 100); err != nil {
		t.Fatalf("Increment: %v", err)
	}
	if err := store.Increment(ctx, userID, metric, period, 50); err != nil {
		t.Fatalf("second Increment: %v", err)
	}

	count, err = store.Get(ctx, userID, metric, period)
	if err != nil {
		t.Fatalf("Get after increments: %v", err)
	}
	if count != 150 {
		t.Fatalf("expected count 150, got %d", count)
	}
}

func TestUsageCounterStore_DifferentPeriods(t *testing.T) {
	database := openTestDB(t)
	store, err := NewUsageCounterStore(database)
	if err != nil {
		t.Fatalf("NewUsageCounterStore: %v", err)
	}

	ctx := context.Background()
	userID := "usage-period-user"
	metric := "api_calls"

	today := DayPeriodKey(time.Now())
	yesterday := DayPeriodKey(time.Now().AddDate(0, 0, -1))
	thisMonth := MonthPeriodKey(time.Now())

	store.Increment(ctx, userID, metric, today, 10)
	store.Increment(ctx, userID, metric, yesterday, 5)
	store.Increment(ctx, userID, metric, thisMonth, 3)

	todayCount, _ := store.Get(ctx, userID, metric, today)
	if todayCount != 10 {
		t.Fatalf("expected 10 for today, got %d", todayCount)
	}

	yesterdayCount, _ := store.Get(ctx, userID, metric, yesterday)
	if yesterdayCount != 5 {
		t.Fatalf("expected 5 for yesterday, got %d", yesterdayCount)
	}
}

func TestUsageCounterStore_ListByUser(t *testing.T) {
	database := openTestDB(t)
	store, err := NewUsageCounterStore(database)
	if err != nil {
		t.Fatalf("NewUsageCounterStore: %v", err)
	}

	ctx := context.Background()
	userID := "usage-list-user"
	period := DayPeriodKey(time.Now())

	store.Increment(ctx, userID, "tokens_in", period, 100)
	store.Increment(ctx, userID, "tokens_out", period, 200)
	store.Increment(ctx, userID, "api_calls", period, 5)

	all, err := store.ListByUser(ctx, userID, "", 0)
	if err != nil {
		t.Fatalf("ListByUser: %v", err)
	}
	if len(all) < 3 {
		t.Fatalf("expected at least 3 counters, got %d", len(all))
	}

	// Filter by metric
	tokensIn, err := store.ListByUser(ctx, userID, "tokens_in", 10)
	if err != nil {
		t.Fatalf("ListByUser (filtered): %v", err)
	}
	for _, c := range tokensIn {
		if c.Metric != "tokens_in" {
			t.Fatalf("expected only tokens_in metric, got %q", c.Metric)
		}
	}
}

func TestUsageCounterStore_PeriodKeyFormats(t *testing.T) {
	now := time.Date(2026, 5, 25, 12, 0, 0, 0, time.UTC)
	if DayPeriodKey(now) != "2026-05-25" {
		t.Fatalf("unexpected DayPeriodKey format: %q", DayPeriodKey(now))
	}
	if MonthPeriodKey(now) != "2026-05" {
		t.Fatalf("unexpected MonthPeriodKey format: %q", MonthPeriodKey(now))
	}
}

// ─── WebSearchSettingStore ────────────────────────────────────────────────────

func TestWebSearchSettingStore_UpsertAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ws-setting@example.com")

	store, err := NewWebSearchSettingStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchSettingStore: %v", err)
	}

	setting, err := store.Upsert(ctx, UpsertWebSearchSettingParams{
		UserID:           user.ID,
		Enabled:          true,
		AllowEnvFallback: true,
		AllowedDomains:   []string{"wikipedia.org", "arxiv.org"},
		BlockedDomains:   []string{"ads.example.com"},
		MaxQueriesPerDay: 50,
	})
	if err != nil {
		t.Fatalf("Upsert: %v", err)
	}
	if setting.ID == "" {
		t.Fatal("expected non-empty setting ID")
	}
	if !setting.Enabled {
		t.Fatal("expected Enabled to be true")
	}
	if len(setting.AllowedDomains) != 2 {
		t.Fatalf("expected 2 allowed domains, got %d", len(setting.AllowedDomains))
	}
	if len(setting.BlockedDomains) != 1 {
		t.Fatalf("expected 1 blocked domain, got %d", len(setting.BlockedDomains))
	}
	if setting.MaxQueriesPerDay != 50 {
		t.Fatalf("expected MaxQueriesPerDay 50, got %d", setting.MaxQueriesPerDay)
	}

	fetched, err := store.GetByUserID(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetByUserID: %v", err)
	}
	if fetched.UserID != user.ID {
		t.Fatalf("expected user ID %q, got %q", user.ID, fetched.UserID)
	}
}

func TestWebSearchSettingStore_UpsertUpdates(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "ws-update@example.com")

	store, err := NewWebSearchSettingStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchSettingStore: %v", err)
	}

	store.Upsert(ctx, UpsertWebSearchSettingParams{
		UserID:           user.ID,
		Enabled:          true,
		MaxQueriesPerDay: 10,
	})

	updated, err := store.Upsert(ctx, UpsertWebSearchSettingParams{
		UserID:           user.ID,
		Enabled:          false,
		MaxQueriesPerDay: 100,
	})
	if err != nil {
		t.Fatalf("second Upsert: %v", err)
	}
	if updated.Enabled {
		t.Fatal("expected Enabled to be false after second upsert")
	}
	if updated.MaxQueriesPerDay != 100 {
		t.Fatalf("expected MaxQueriesPerDay 100, got %d", updated.MaxQueriesPerDay)
	}
}

func TestWebSearchSettingStore_NotFound(t *testing.T) {
	database := openTestDB(t)
	store, err := NewWebSearchSettingStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchSettingStore: %v", err)
	}

	_, err = store.GetByUserID(context.Background(), "nonexistent-user")
	if err == nil {
		t.Fatal("expected error for nonexistent user, got nil")
	}
}

// ─── WebSearchLogStore ────────────────────────────────────────────────────────

func TestWebSearchLogStore_CreateAndList(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "wslog-list@example.com")

	store, err := NewWebSearchLogStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchLogStore: %v", err)
	}

	for i := range 3 {
		_, err := store.Create(ctx, CreateWebSearchLogParams{
			UserID:         user.ID,
			Provider:       "serper",
			Query:          "test query " + string(rune('0'+i)),
			Status:         "success",
			ResultCount:    5,
			DurationMillis: 250,
		})
		if err != nil {
			t.Fatalf("Create log %d: %v", i, err)
		}
	}

	logs, err := store.ListByUserID(ctx, user.ID, 10)
	if err != nil {
		t.Fatalf("ListByUserID: %v", err)
	}
	if len(logs) != 3 {
		t.Fatalf("expected 3 logs, got %d", len(logs))
	}
}

func TestWebSearchLogStore_CountSince(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "wslog-count@example.com")

	store, err := NewWebSearchLogStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchLogStore: %v", err)
	}

	before := time.Now().UTC().Add(-time.Second)

	store.Create(ctx, CreateWebSearchLogParams{UserID: user.ID, Provider: "serper", Query: "q1", Status: "success"})
	store.Create(ctx, CreateWebSearchLogParams{UserID: user.ID, Provider: "serper", Query: "q2", Status: "success"})
	// quota_exceeded status should be excluded from count
	store.Create(ctx, CreateWebSearchLogParams{UserID: user.ID, Provider: "serper", Query: "q3", Status: "quota_exceeded"})

	count, err := store.CountByUserIDSince(ctx, user.ID, before)
	if err != nil {
		t.Fatalf("CountByUserIDSince: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected 2 (quota_exceeded excluded), got %d", count)
	}
}

func TestWebSearchLogStore_DomainRoundTrip(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "wslog-domains@example.com")

	store, err := NewWebSearchLogStore(database)
	if err != nil {
		t.Fatalf("NewWebSearchLogStore: %v", err)
	}

	log, err := store.Create(ctx, CreateWebSearchLogParams{
		UserID:         user.ID,
		Status:         "success",
		AllowedDomains: []string{"wikipedia.org", "arxiv.org"},
		BlockedDomains: []string{"ads.example.com"},
	})
	if err != nil {
		t.Fatalf("Create with domains: %v", err)
	}
	if len(log.AllowedDomains) != 2 {
		t.Fatalf("expected 2 allowed domains, got %d", len(log.AllowedDomains))
	}
	if len(log.BlockedDomains) != 1 {
		t.Fatalf("expected 1 blocked domain, got %d", len(log.BlockedDomains))
	}
}

func TestSessionOwnershipStore_CreateAndGet(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "session-owner@example.com")

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	ownership, err := store.Create(ctx, CreateSessionOwnershipParams{
		SessionID: "sess-001",
		UserID:    user.ID,
		Title:     "Test session",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if ownership.SessionID != "sess-001" {
		t.Fatalf("expected session ID %q, got %q", "sess-001", ownership.SessionID)
	}

	fetched, err := store.GetBySessionID(ctx, "sess-001")
	if err != nil {
		t.Fatalf("GetBySessionID: %v", err)
	}
	if fetched.UserID != user.ID {
		t.Fatalf("expected user ID %q, got %q", user.ID, fetched.UserID)
	}
	if fetched.Title != "Test session" {
		t.Fatalf("expected title %q, got %q", "Test session", fetched.Title)
	}
}

func TestSessionOwnershipStore_NotFound(t *testing.T) {
	database := openTestDB(t)

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	_, err = store.GetBySessionID(context.Background(), "nonexistent-session")
	if err == nil {
		t.Fatal("expected error for non-existent session, got nil")
	}
}

func TestSessionOwnershipStore_ListByUser(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	userA := bootstrapTestUser(t, ctx, identityStore, "session-listA@example.com")
	userB := bootstrapTestUser(t, ctx, identityStore, "session-listB@example.com")

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	store.Create(ctx, CreateSessionOwnershipParams{SessionID: "s-A1", UserID: userA.ID})
	store.Create(ctx, CreateSessionOwnershipParams{SessionID: "s-A2", UserID: userA.ID})
	store.Create(ctx, CreateSessionOwnershipParams{SessionID: "s-B1", UserID: userB.ID})

	listA, err := store.ListByUserID(ctx, userA.ID)
	if err != nil {
		t.Fatalf("ListByUserID(A): %v", err)
	}
	if len(listA) != 2 {
		t.Fatalf("expected 2 sessions for userA, got %d", len(listA))
	}

	listB, err := store.ListByUserID(ctx, userB.ID)
	if err != nil {
		t.Fatalf("ListByUserID(B): %v", err)
	}
	if len(listB) != 1 {
		t.Fatalf("expected 1 session for userB, got %d", len(listB))
	}
}

func TestSessionOwnershipStore_UpdateTitle(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "session-title@example.com")

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	store.Create(ctx, CreateSessionOwnershipParams{
		SessionID: "title-sess",
		UserID:    user.ID,
		Title:     "Old Title",
	})

	if err := store.UpdateTitle(ctx, "title-sess", "New Title"); err != nil {
		t.Fatalf("UpdateTitle: %v", err)
	}

	updated, err := store.GetBySessionID(ctx, "title-sess")
	if err != nil {
		t.Fatalf("GetBySessionID after UpdateTitle: %v", err)
	}
	if updated.Title != "New Title" {
		t.Fatalf("expected title %q, got %q", "New Title", updated.Title)
	}
}

func TestSessionOwnershipStore_Delete(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "session-del@example.com")

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	store.Create(ctx, CreateSessionOwnershipParams{SessionID: "del-sess", UserID: user.ID})

	if err := store.Delete(ctx, "del-sess"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err = store.GetBySessionID(ctx, "del-sess")
	if err == nil {
		t.Fatal("expected error after delete, got nil")
	}
}

func TestSessionOwnershipStore_UpdateProviderSelection(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "session-provider@example.com")

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	store.Create(ctx, CreateSessionOwnershipParams{SessionID: "prov-sess", UserID: user.ID})

	if err := store.UpdateProviderSelection(ctx, "prov-sess", "ps-123", "gpt-4o"); err != nil {
		t.Fatalf("UpdateProviderSelection: %v", err)
	}

	updated, err := store.GetBySessionID(ctx, "prov-sess")
	if err != nil {
		t.Fatalf("GetBySessionID after UpdateProviderSelection: %v", err)
	}
	if updated.ProviderSettingID != "ps-123" {
		t.Fatalf("expected ProviderSettingID %q, got %q", "ps-123", updated.ProviderSettingID)
	}
	if updated.ModelID != "gpt-4o" {
		t.Fatalf("expected ModelID %q, got %q", "gpt-4o", updated.ModelID)
	}
}

func TestSessionOwnershipStore_IdempotentCreate(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "session-idem@example.com")

	store, err := NewSessionOwnershipStore(database)
	if err != nil {
		t.Fatalf("NewSessionOwnershipStore: %v", err)
	}

	// Creating the same session twice should not error (ON CONFLICT DO NOTHING).
	store.Create(ctx, CreateSessionOwnershipParams{SessionID: "idem-sess", UserID: user.ID})
	if _, err := store.Create(ctx, CreateSessionOwnershipParams{SessionID: "idem-sess", UserID: user.ID}); err != nil {
		t.Fatalf("second Create for same session should not error: %v", err)
	}
}

func TestUserMemoryStore_CRUD(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "mem-crud@example.com")

	store, err := NewUserMemoryStore(database)
	if err != nil {
		t.Fatalf("NewUserMemoryStore: %v", err)
	}

	// Create
	m, err := store.Create(ctx, CreateUserMemoryParams{
		UserID:     user.ID,
		Type:       MemoryTypeFact,
		Key:        "preferred_language",
		Value:      "French",
		Importance: 0.8,
		Source:     "manual",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if m.ID == "" {
		t.Fatal("expected non-empty memory ID")
	}
	if m.Key != "preferred_language" {
		t.Fatalf("expected key %q, got %q", "preferred_language", m.Key)
	}

	// GetByID
	fetched, err := store.GetByID(ctx, user.ID, m.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if fetched.Value != "French" {
		t.Fatalf("expected value %q, got %q", "French", fetched.Value)
	}

	// Update
	newValue := "English"
	updated, err := store.Update(ctx, user.ID, m.ID, UpdateUserMemoryParams{
		Value: &newValue,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Value != "English" {
		t.Fatalf("expected updated value %q, got %q", "English", updated.Value)
	}

	// List
	memories, err := store.List(ctx, user.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(memories) != 1 {
		t.Fatalf("expected 1 memory, got %d", len(memories))
	}

	// Delete
	if err := store.Delete(ctx, user.ID, m.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	memories, err = store.List(ctx, user.ID)
	if err != nil {
		t.Fatalf("List after delete: %v", err)
	}
	if len(memories) != 0 {
		t.Fatalf("expected 0 memories after delete, got %d", len(memories))
	}
}

func TestUserMemoryStore_UserIsolation(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	userA := bootstrapTestUser(t, ctx, identityStore, "mem-userA@example.com")
	userB := bootstrapTestUser(t, ctx, identityStore, "mem-userB@example.com")

	store, err := NewUserMemoryStore(database)
	if err != nil {
		t.Fatalf("NewUserMemoryStore: %v", err)
	}

	m, _ := store.Create(ctx, CreateUserMemoryParams{
		UserID: userA.ID,
		Type:   MemoryTypeFact,
		Key:    "secret",
		Value:  "A only",
	})

	// UserB should not be able to read userA's memory.
	_, err = store.GetByID(ctx, userB.ID, m.ID)
	if err == nil {
		t.Fatal("expected error when accessing another user's memory, got nil")
	}

	// UserB's list should be empty.
	memories, err := store.List(ctx, userB.ID)
	if err != nil {
		t.Fatalf("List for userB: %v", err)
	}
	if len(memories) != 0 {
		t.Fatalf("expected 0 memories for userB, got %d", len(memories))
	}
}

func TestUserMemoryStore_ImportanceNormalization(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "mem-importance@example.com")

	store, err := NewUserMemoryStore(database)
	if err != nil {
		t.Fatalf("NewUserMemoryStore: %v", err)
	}

	// Importance <= 0 should be normalized to 0.5
	m, _ := store.Create(ctx, CreateUserMemoryParams{
		UserID:     user.ID,
		Key:        "test",
		Importance: -1,
	})
	if m.Importance != 0.5 {
		t.Fatalf("expected importance 0.5 for negative input, got %f", m.Importance)
	}

	// Importance > 1 should be clamped to 1
	m2, _ := store.Create(ctx, CreateUserMemoryParams{
		UserID:     user.ID,
		Key:        "test2",
		Importance: 5.0,
	})
	if m2.Importance != 1.0 {
		t.Fatalf("expected importance 1.0 for >1 input, got %f", m2.Importance)
	}
}

func TestUserMemoryStore_DeleteAll(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "mem-deleteall@example.com")

	store, err := NewUserMemoryStore(database)
	if err != nil {
		t.Fatalf("NewUserMemoryStore: %v", err)
	}

	for i := range 5 {
		store.Create(ctx, CreateUserMemoryParams{
			UserID: user.ID,
			Key:    "key-" + string(rune('A'+i)),
		})
	}

	count, err := store.Count(ctx, user.ID)
	if err != nil {
		t.Fatalf("Count: %v", err)
	}
	if count != 5 {
		t.Fatalf("expected 5 memories, got %d", count)
	}

	deleted, err := store.DeleteAll(ctx, user.ID)
	if err != nil {
		t.Fatalf("DeleteAll: %v", err)
	}
	if deleted != 5 {
		t.Fatalf("expected 5 deleted, got %d", deleted)
	}

	count, _ = store.Count(ctx, user.ID)
	if count != 0 {
		t.Fatalf("expected 0 memories after DeleteAll, got %d", count)
	}
}

func TestUserMemoryStore_TypeDefault(t *testing.T) {
	database := openTestDB(t)
	identityStore, err := NewIdentityStore(database)
	if err != nil {
		t.Fatalf("NewIdentityStore: %v", err)
	}

	ctx := context.Background()
	user := bootstrapTestUser(t, ctx, identityStore, "mem-type@example.com")

	store, err := NewUserMemoryStore(database)
	if err != nil {
		t.Fatalf("NewUserMemoryStore: %v", err)
	}

	m, _ := store.Create(ctx, CreateUserMemoryParams{
		UserID: user.ID,
		Key:    "no-type",
		Type:   "",
	})
	if m.Type != MemoryTypeFact {
		t.Fatalf("expected default type %q, got %q", MemoryTypeFact, m.Type)
	}
}

// ─── LongTermMemoryStore tests ────────────────────────────────────────────────

func TestLongTermMemoryStore_UpsertAndSearch(t *testing.T) {
	database := openTestDB(t)
	store, err := NewLongTermMemoryStore(database)
	if err != nil {
		t.Fatalf("NewLongTermMemoryStore: %v", err)
	}
	ctx := context.Background()
	userID := "ltm-user-1"

	created, err := store.UpsertEntities(ctx, userID, []longterm.EntityInput{
		{Name: "seshat", EntityType: "project", Observations: []string{"backend in Go"}},
		{Name: "claude", EntityType: "ai-model", Observations: []string{"made by Anthropic"}},
	})
	if err != nil {
		t.Fatalf("UpsertEntities: %v", err)
	}
	if len(created) != 2 {
		t.Fatalf("expected 2 created, got %d", len(created))
	}

	// Re-upsert same entity — must be no-op.
	dup, err := store.UpsertEntities(ctx, userID, []longterm.EntityInput{{Name: "seshat", EntityType: "project"}})
	if err != nil {
		t.Fatalf("UpsertEntities (dup): %v", err)
	}
	if len(dup) != 0 {
		t.Fatalf("expected 0 created on dup, got %d", len(dup))
	}

	// Search by name.
	graph, err := store.SearchNodes(ctx, userID, "seshat")
	if err != nil {
		t.Fatalf("SearchNodes: %v", err)
	}
	if len(graph.Entities) != 1 || graph.Entities[0].Name != "seshat" {
		t.Fatalf("SearchNodes: expected seshat, got %v", graph.Entities)
	}
	if len(graph.Entities[0].Observations) == 0 || graph.Entities[0].Observations[0] != "backend in Go" {
		t.Fatalf("SearchNodes: observations missing or wrong: %v", graph.Entities[0].Observations)
	}

	// Search by observation content.
	graph, err = store.SearchNodes(ctx, userID, "anthropic")
	if err != nil {
		t.Fatalf("SearchNodes (obs): %v", err)
	}
	if len(graph.Entities) != 1 || graph.Entities[0].Name != "claude" {
		t.Fatalf("SearchNodes (obs): expected claude, got %v", graph.Entities)
	}
}

func TestLongTermMemoryStore_AddObservations(t *testing.T) {
	database := openTestDB(t)
	store, err := NewLongTermMemoryStore(database)
	if err != nil {
		t.Fatalf("NewLongTermMemoryStore: %v", err)
	}
	ctx := context.Background()
	userID := "ltm-user-2"

	_, err = store.UpsertEntities(ctx, userID, []longterm.EntityInput{{Name: "go", EntityType: "language"}})
	if err != nil {
		t.Fatalf("UpsertEntities: %v", err)
	}

	results, err := store.AddObservations(ctx, userID, []longterm.ObservationInput{
		{EntityName: "go", Contents: []string{"compiled", "garbage collected"}},
	})
	if err != nil {
		t.Fatalf("AddObservations: %v", err)
	}
	if len(results[0].AddedObservations) != 2 {
		t.Fatalf("expected 2 added, got %d", len(results[0].AddedObservations))
	}

	// Duplicate observation must be skipped.
	results, err = store.AddObservations(ctx, userID, []longterm.ObservationInput{
		{EntityName: "go", Contents: []string{"compiled"}},
	})
	if err != nil {
		t.Fatalf("AddObservations (dup): %v", err)
	}
	if len(results[0].AddedObservations) != 0 {
		t.Fatalf("expected 0 added for duplicate, got %d", len(results[0].AddedObservations))
	}
}

func TestLongTermMemoryStore_OpenNodes(t *testing.T) {
	database := openTestDB(t)
	store, err := NewLongTermMemoryStore(database)
	if err != nil {
		t.Fatalf("NewLongTermMemoryStore: %v", err)
	}
	ctx := context.Background()
	userID := "ltm-user-3"

	_, err = store.UpsertEntities(ctx, userID, []longterm.EntityInput{
		{Name: "alice", EntityType: "person"},
		{Name: "bob", EntityType: "person"},
	})
	if err != nil {
		t.Fatalf("UpsertEntities: %v", err)
	}

	graph, err := store.OpenNodes(ctx, userID, []string{"alice"})
	if err != nil {
		t.Fatalf("OpenNodes: %v", err)
	}
	if len(graph.Entities) != 1 || graph.Entities[0].Name != "alice" {
		t.Fatalf("expected only alice, got %v", graph.Entities)
	}
}

func TestLongTermMemoryStore_RetrieveForContext(t *testing.T) {
	database := openTestDB(t)
	store, err := NewLongTermMemoryStore(database)
	if err != nil {
		t.Fatalf("NewLongTermMemoryStore: %v", err)
	}
	ctx := context.Background()
	userID := "ltm-user-4"

	_, err = store.UpsertEntities(ctx, userID, []longterm.EntityInput{
		{Name: "Go", EntityType: "language", Observations: []string{"statically typed", "compiled"}},
	})
	if err != nil {
		t.Fatalf("UpsertEntities: %v", err)
	}

	block, err := store.RetrieveForContext(ctx, userID, "Go", 500)
	if err != nil {
		t.Fatalf("RetrieveForContext: %v", err)
	}
	if block == "" {
		t.Fatal("expected non-empty memory block, got empty")
	}
	if len(block) < 10 {
		t.Fatalf("memory block too short: %q", block)
	}

	// Empty result when query matches nothing.
	block, err = store.RetrieveForContext(ctx, userID, "python", 500)
	if err != nil {
		t.Fatalf("RetrieveForContext (no match): %v", err)
	}
	if block != "" {
		t.Fatalf("expected empty block for no match, got %q", block)
	}
}

func TestLongTermMemoryStore_UserIsolation(t *testing.T) {
	database := openTestDB(t)
	store, err := NewLongTermMemoryStore(database)
	if err != nil {
		t.Fatalf("NewLongTermMemoryStore: %v", err)
	}
	ctx := context.Background()

	_, _ = store.UpsertEntities(ctx, "user-A", []longterm.EntityInput{{Name: "secret", EntityType: "data"}})
	_, _ = store.UpsertEntities(ctx, "user-B", []longterm.EntityInput{{Name: "other", EntityType: "data"}})

	graph, err := store.SearchNodes(ctx, "user-B", "secret")
	if err != nil {
		t.Fatalf("SearchNodes: %v", err)
	}
	if len(graph.Entities) != 0 {
		t.Fatalf("user isolation broken: user-B can see user-A's entity")
	}
}
