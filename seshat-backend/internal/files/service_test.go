package files

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
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

func newTestService(t *testing.T) (*Service, *db.FileStore, storage.ArtifactStore) {
	t.Helper()
	fileStore, err := db.NewFileStore(openTestDB(t))
	if err != nil {
		t.Fatalf("NewFileStore: %v", err)
	}
	store := newTestArtifactStore(t)
	return NewService(fileStore, store), fileStore, store
}

// countingConverter records every call, so a test can tell that a reader was or was not asked.
type countingConverter struct{ calls atomic.Int32 }

func (c *countingConverter) IsAvailable(context.Context) bool { return true }
func (c *countingConverter) ConvertFile(context.Context, string) (*documentreader.ConversionResult, error) {
	c.calls.Add(1)
	return nil, errors.New("not available in this test")
}
func (c *countingConverter) ConvertBytes(context.Context, []byte, string) (*documentreader.ConversionResult, error) {
	c.calls.Add(1)
	return nil, errors.New("not available in this test")
}
func (c *countingConverter) ConvertURL(context.Context, string) (*documentreader.ConversionResult, error) {
	c.calls.Add(1)
	return nil, errors.New("not available in this test")
}

func TestReadMarkdownReturnsTheKeptResultWithoutReadingAgain(t *testing.T) {
	ctx := context.Background()
	svc, fileStore, store := newTestService(t)
	converter := &countingConverter{}
	svc.WithDocumentReader(func(context.Context) documentreader.Converter { return converter })
	principal := testPrincipal("user-1")

	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID: principal.User.ID, Filename: "scan.png", ContentType: "image/png", Size: 4, StorageKey: "files/scan.png",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	if err := documentreading.SaveReadResult(ctx, store, file.ID, documentreading.ReadResult{
		Filename: "scan.png", Status: documentreading.StatusReady, Engine: documentreading.EngineExternal,
		Markdown: "Cached OCR markdown", Text: "Cached OCR markdown",
	}); err != nil {
		t.Fatalf("SaveReadResult: %v", err)
	}

	markdown, gotFile, err := svc.ReadMarkdown(ctx, principal, file.ID)
	if err != nil {
		t.Fatalf("ReadMarkdown: %v", err)
	}
	if markdown != "Cached OCR markdown" || gotFile.ID != file.ID {
		t.Fatalf("unexpected result: %q for %s", markdown, gotFile.ID)
	}
	if converter.calls.Load() != 0 {
		t.Fatalf("a kept result must not be read again, the reader was called %d times", converter.calls.Load())
	}
}

func TestReadMarkdownReadsTheDocumentWhenAskedAndKeepsTheResult(t *testing.T) {
	ctx := context.Background()
	svc, fileStore, store := newTestService(t)
	principal := testPrincipal("user-1")

	if _, err := store.Put(ctx, "files/notes.txt", []byte("Hello from the preview"), "text/plain"); err != nil {
		t.Fatalf("put blob: %v", err)
	}
	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID: principal.User.ID, Filename: "notes.txt", ContentType: "text/plain", Size: 22, StorageKey: "files/notes.txt",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}

	markdown, _, err := svc.ReadMarkdown(ctx, principal, file.ID)
	if err != nil || markdown != "Hello from the preview" {
		t.Fatalf("first read: %q, %v", markdown, err)
	}

	// The blob is gone: the second read can only come from what was kept.
	if err := store.Delete(ctx, "files/notes.txt"); err != nil {
		t.Fatalf("delete blob: %v", err)
	}
	markdown, _, err = svc.ReadMarkdown(ctx, principal, file.ID)
	if err != nil || markdown != "Hello from the preview" {
		t.Fatalf("second read should come from the kept result: %q, %v", markdown, err)
	}
}

func TestReadMarkdownOfAFileWithNoTextIsNotFound(t *testing.T) {
	ctx := context.Background()
	svc, fileStore, store := newTestService(t)
	principal := testPrincipal("user-1")

	if _, err := store.Put(ctx, "files/blob.bin", []byte{0x00, 0x01, 0x02, 0xff, 0xfe}, "application/octet-stream"); err != nil {
		t.Fatalf("put blob: %v", err)
	}
	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID: principal.User.ID, Filename: "blob.bin", ContentType: "application/octet-stream", Size: 5, StorageKey: "files/blob.bin",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	_, _, err = svc.ReadMarkdown(ctx, principal, file.ID)
	var backendErr *bkerr.Error
	if !errors.As(err, &backendErr) || backendErr.Kind != bkerr.ErrorKindNotFound {
		t.Fatalf("want a not-found error, got %v", err)
	}
}

func TestReadMarkdownIsRefusedToAnotherUser(t *testing.T) {
	ctx := context.Background()
	svc, fileStore, store := newTestService(t)
	if _, err := store.Put(ctx, "files/private.txt", []byte("private"), "text/plain"); err != nil {
		t.Fatalf("put blob: %v", err)
	}
	file, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID: "owner", Filename: "private.txt", ContentType: "text/plain", Size: 7, StorageKey: "files/private.txt",
	})
	if err != nil {
		t.Fatalf("create file: %v", err)
	}
	if _, _, err := svc.ReadMarkdown(ctx, testPrincipal("someone-else"), file.ID); err == nil {
		t.Fatal("another user must not read the document")
	}
}

func TestAttachingAFileConvertsNothing(t *testing.T) {
	ctx := context.Background()
	svc, _, store := newTestService(t)
	converter := &countingConverter{}
	svc.WithDocumentReader(func(context.Context) documentreader.Converter { return converter })
	principal := testPrincipal("user-1")
	workspace := t.TempDir()

	file, err := svc.UploadSessionFile(ctx, principal, "session-1", workspace, UploadFileParams{
		Filename: "report.pdf", ContentType: "application/pdf", Data: []byte("%PDF-1.4 not really a pdf but long enough"),
	})
	if err != nil {
		t.Fatalf("UploadSessionFile: %v", err)
	}

	// The agent reads the file in the workspace itself; nothing is written next to it and no reader is asked.
	time.Sleep(300 * time.Millisecond) // the old conversion started in a goroutine right after the upload
	if converter.calls.Load() != 0 {
		t.Fatalf("attaching must not read the document, the reader was called %d times", converter.calls.Load())
	}
	if _, ok, _ := documentreading.LoadReadResult(ctx, store, file.ID); ok {
		t.Fatal("attaching must not keep a read result")
	}
	entries, err := os.ReadDir(filepath.Join(workspace, filepath.Dir(file.LocalPath)))
	if err != nil {
		t.Fatalf("read upload dir: %v", err)
	}
	if len(entries) != 1 || entries[0].Name() != "report.pdf" {
		t.Fatalf("only the file itself should be in the workspace, got %v", entries)
	}
}
