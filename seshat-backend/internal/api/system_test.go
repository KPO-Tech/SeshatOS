package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// TestHandleSystemStatusReportsDockerSandbox covers the combination logic
// added alongside sdk.Client.SandboxKind(): when the query client actually
// resolved to the Docker backend, the response must say so explicitly
// rather than falling back to the Landlock-only sdk.SandboxAvailable() check
// (which would report false on every non-Linux desktop regardless of Docker).
func TestHandleSystemStatusReportsDockerSandbox(t *testing.T) {
	a := &App{sandboxKind: string(sdk.SandboxKindDocker)}

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.SandboxConfined {
		t.Fatal("expected sandbox_confined=true when the Docker backend is active")
	}
	if resp.SandboxKind != "docker" {
		t.Fatalf("expected sandbox_kind=\"docker\", got %q", resp.SandboxKind)
	}
}

// TestHandleSystemStatusReportsUnconfinedWithoutDockerOrLandlock covers the
// other side: no Docker sandbox resolved (empty sandboxKind) and no Landlock
// available (true on this test's platform whenever it's not Linux, and even
// on Linux CI runners that don't grant the syscall) reports fully unconfined,
// not a stale/incorrect "confined" status.
func TestHandleSystemStatusReportsUnconfinedWithoutDockerOrLandlock(t *testing.T) {
	if sdk.SandboxAvailable() {
		t.Skip("Landlock is available on this host - this test only covers the fully-unconfined case")
	}
	a := &App{}

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.SandboxConfined {
		t.Fatal("expected sandbox_confined=false when neither Docker nor Landlock is active")
	}
	if resp.SandboxKind != "" {
		t.Fatalf("expected empty sandbox_kind, got %q", resp.SandboxKind)
	}
}

func TestHandleSystemStatusIncludesLocalDocumentCapabilities(t *testing.T) {
	a := &App{}

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.DocumentConversionAvailable {
		t.Fatalf("expected document conversion to remain available, got %+v", resp)
	}
	if !resp.DocumentLocalBasicAvailable {
		t.Fatalf("expected local basic document reading capability, got %+v", resp)
	}
	if !resp.DocumentPDFSmartAvailable {
		t.Fatalf("expected pdfsmart document reading capability, got %+v", resp)
	}
	if resp.DocumentVisionFallbackConfigured {
		t.Fatalf("expected vision fallback to stay disabled until configured, got %+v", resp)
	}
}

func TestHandleSystemStatusIncludesMatchingDocumentReaderDiagnostic(t *testing.T) {
	store := newTestDocumentReaderStore(t)
	if _, err := store.Upsert(context.Background(), db.UpsertDocumentReaderConfigParams{
		BaseURL: "http://127.0.0.1:5100/",
		Enabled: true,
	}); err != nil {
		t.Fatalf("upsert document reader config: %v", err)
	}
	a := &App{documentReaderStore: store}
	a.setDocumentReaderDiagnostic(documentReaderDiagnostic{
		BaseURL:                 "http://127.0.0.1:5100",
		TestedAt:                time.Unix(42, 0),
		Reachable:               true,
		ConversionAvailable:     true,
		HybridChunkingAvailable: false,
		HybridChunkingError:     "chunker disabled",
	})

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.DocumentReaderReachable == nil || !*resp.DocumentReaderReachable {
		t.Fatalf("expected document reader reachable diagnostic, got %+v", resp)
	}
	if resp.DocumentExternalConversionAvailable == nil || !*resp.DocumentExternalConversionAvailable {
		t.Fatalf("expected external conversion diagnostic, got %+v", resp)
	}
	if resp.DocumentHybridChunkingConfigured {
		t.Fatalf("expected hybrid chunking to reflect diagnostic failure, got %+v", resp)
	}
	if resp.DocumentHybridChunkingError != "chunker disabled" {
		t.Fatalf("expected hybrid chunking error, got %q", resp.DocumentHybridChunkingError)
	}
	if resp.DocumentReaderTestedAt != 42 {
		t.Fatalf("expected document_reader_tested_at=42, got %d", resp.DocumentReaderTestedAt)
	}
}

func TestHandleSystemStatusIgnoresStaleDocumentReaderDiagnostic(t *testing.T) {
	store := newTestDocumentReaderStore(t)
	if _, err := store.Upsert(context.Background(), db.UpsertDocumentReaderConfigParams{
		BaseURL: "http://127.0.0.1:5200",
		Enabled: true,
	}); err != nil {
		t.Fatalf("upsert document reader config: %v", err)
	}
	a := &App{documentReaderStore: store}
	a.setDocumentReaderDiagnostic(documentReaderDiagnostic{
		BaseURL:             "http://127.0.0.1:5100",
		Reachable:           false,
		ConversionAvailable: false,
		HybridChunkingError: "old failure",
	})

	req := httptest.NewRequest(http.MethodGet, "/system/status", nil)
	rec := httptest.NewRecorder()
	a.handleSystemStatus(rec, req)

	var resp systemStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.DocumentExternalConfigured {
		t.Fatalf("expected external reader to remain configured, got %+v", resp)
	}
	if resp.DocumentReaderReachable != nil {
		t.Fatalf("expected stale diagnostic to be omitted, got %+v", resp)
	}
	if !resp.DocumentHybridChunkingConfigured {
		t.Fatalf("expected configured fallback before a matching diagnostic, got %+v", resp)
	}
	if resp.DocumentHybridChunkingError != "" {
		t.Fatalf("expected stale error to be omitted, got %q", resp.DocumentHybridChunkingError)
	}
}

func newTestDocumentReaderStore(t *testing.T) *db.DocumentReaderConfigStore {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewDocumentReaderConfigStore(database)
	if err != nil {
		t.Fatalf("new document reader store: %v", err)
	}
	return store
}
