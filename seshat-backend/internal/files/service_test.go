package files

import (
	"context"
	"path/filepath"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func newTestArtifactStore(t *testing.T) storage.ArtifactStore {
	t.Helper()
	provider, err := storage.NewLocalProviderWithConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	if err != nil {
		t.Fatalf("NewLocalProviderWithConfig: %v", err)
	}
	return storage.NewArtifactStore(provider)
}

func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{
		User:  backendauth.User{ID: userID},
		Roles: []string{"member"},
	}
}

func TestReadMarkdownFallsBackToCachedReadResult(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	store := newTestArtifactStore(t)
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	svc := NewService(fileStore, store)
	principal := testPrincipal("user-1")

	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		Filename:    "scan.png",
		ContentType: "image/png",
		Size:        4,
		StorageKey:  "files/scan.png",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	if err := documentreading.SaveReadResult(ctx, store, file.ID, documentreading.ReadResult{
		Filename:  "scan.png",
		Status:    documentreading.StatusReady,
		Engine:    documentreading.EngineExternal,
		PageCount: 1,
		Pages: []documentreading.PageReadResult{{
			Page:     1,
			Source:   "external",
			HasImage: true,
		}},
		Markdown: "Cached OCR markdown",
		Text:     "Cached OCR markdown",
		Images: []documentreader.ExtractedImage{{
			Filename: "scan-figure-1.png",
			MimeType: "image/png",
		}},
	}); err != nil {
		t.Fatalf("SaveReadResult: %v", err)
	}

	markdown, gotFile, err := svc.ReadMarkdown(ctx, principal, file.ID, "")
	if err != nil {
		t.Fatalf("ReadMarkdown: %v", err)
	}
	if gotFile.ID != file.ID {
		t.Fatalf("expected file %s, got %s", file.ID, gotFile.ID)
	}
	if markdown != "Cached OCR markdown" {
		t.Fatalf("unexpected markdown: %q", markdown)
	}
	if gotFile.DocumentReadStatus != "converted" || gotFile.DocumentReadEngine != documentreading.EngineExternal {
		t.Fatalf("unexpected document read metadata: status=%q engine=%q", gotFile.DocumentReadStatus, gotFile.DocumentReadEngine)
	}
	if gotFile.DocumentReadPages != 1 || gotFile.DocumentReadImages != 1 {
		t.Fatalf("unexpected document read counters: pages=%d images=%d", gotFile.DocumentReadPages, gotFile.DocumentReadImages)
	}
	if len(gotFile.DocumentReadVisualPages) != 1 || gotFile.DocumentReadVisualPages[0] != 1 {
		t.Fatalf("unexpected visual pages: %#v", gotFile.DocumentReadVisualPages)
	}
}

func TestReadMarkdownFallsBackToCacheWhenSidecarMissing(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	store := newTestArtifactStore(t)
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	svc := NewService(fileStore, store)
	principal := testPrincipal("user-2")

	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:       principal.User.ID,
		Filename:     "report.pdf",
		ContentType:  "application/pdf",
		Size:         4,
		StorageKey:   "files/report.pdf",
		MarkdownPath: "uploads/documents/report.md",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	if err := documentreading.SaveReadResult(ctx, store, file.ID, documentreading.ReadResult{
		Filename: "report.pdf",
		Status:   documentreading.StatusReady,
		Engine:   documentreading.EngineLocalBasic,
		Markdown: "Cached PDF markdown",
		Text:     "Cached PDF markdown",
	}); err != nil {
		t.Fatalf("SaveReadResult: %v", err)
	}

	markdown, _, err := svc.ReadMarkdown(ctx, principal, file.ID, t.TempDir())
	if err != nil {
		t.Fatalf("ReadMarkdown: %v", err)
	}
	if markdown != "Cached PDF markdown" {
		t.Fatalf("unexpected markdown: %q", markdown)
	}
}

func TestEnrichDocumentReadMetadataMarksFreshConvertibleFileProcessing(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	store := newTestArtifactStore(t)
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	svc := NewService(fileStore, store)

	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      "user-1",
		Filename:    "report.pdf",
		ContentType: "application/pdf",
		Size:        4,
		StorageKey:  "files/report.pdf",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}

	got := svc.enrichDocumentReadMetadata(ctx, fileFromDB(*file))
	if got.DocumentReadStatus != "processing" {
		t.Fatalf("expected processing status, got %q", got.DocumentReadStatus)
	}
}

func TestEnrichDocumentReadMetadataMarksCachedFailureFailed(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	store := newTestArtifactStore(t)
	fileStore, err := db.NewFileStore(database)
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	svc := NewService(fileStore, store)

	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      "user-1",
		Filename:    "report.pdf",
		ContentType: "application/pdf",
		Size:        4,
		StorageKey:  "files/report.pdf",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	if err := documentreading.SaveReadFailure(ctx, store, file.ID, "reader failed"); err != nil {
		t.Fatalf("SaveReadFailure: %v", err)
	}

	got := svc.enrichDocumentReadMetadata(ctx, fileFromDB(*file))
	if got.DocumentReadStatus != "failed" {
		t.Fatalf("expected failed status, got %q", got.DocumentReadStatus)
	}
}
