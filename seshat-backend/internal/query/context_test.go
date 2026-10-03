package query

import (
	"context"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendfiles "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/files"
	backendmemories "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/memories"
)

// ─── buildAttachmentContext ───────────────────────────────────────────────────

type fakeFilesProvider struct {
	files map[string]*backendfiles.File
	data  map[string][]byte
}

func (f fakeFilesProvider) GetFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*backendfiles.File, error) {
	return f.files[fileID], nil
}

func (f fakeFilesProvider) DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) ([]byte, *backendfiles.File, error) {
	return f.data[fileID], f.files[fileID], nil
}

func (f fakeFilesProvider) AttachToMessage(ctx context.Context, fileIDs []string, sessionID string, messageIndex int) error {
	return nil
}

func (f fakeFilesProvider) ListMessageAttachments(ctx context.Context, sessionID string) ([]backendfiles.File, error) {
	return nil, nil
}

func (f fakeFilesProvider) DeleteBySessionID(ctx context.Context, sessionID string) error {
	return nil
}

func TestBuildAttachmentContext_ListsFilesWithoutInliningContent(t *testing.T) {
	provider := fakeFilesProvider{
		files: map[string]*backendfiles.File{
			"txt-1": {
				ID:          "txt-1",
				Filename:    "notes.txt",
				ContentType: "text/plain",
				Size:        28,
				LocalPath:   "uploads/documents/notes.txt",
			},
			"pdf-1": {
				ID:          "pdf-1",
				Filename:    "brief.pdf",
				ContentType: "application/pdf",
				Size:        2048,
				LocalPath:   "uploads/documents/brief.pdf",
			},
		},
		data: map[string][]byte{
			"txt-1": []byte("secret text from the attachment"),
		},
	}

	got := buildAttachmentContext(context.Background(), nil, provider, []string{"txt-1", "pdf-1"}, "workspace")
	for _, want := range []string{
		"## Attached Documents",
		"<attached_file",
		`filename="notes.txt"`,
		`workspace_path="uploads/documents/notes.txt"`,
		`filename="brief.pdf"`,
		`workspace_path="uploads/documents/brief.pdf"`,
		"read them with read_file on the workspace path",
		"in parts with the pages parameter",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("expected %q in block, got:\n%s", want, got)
		}
	}
	if strings.Contains(got, "secret text from the attachment") {
		t.Fatalf("did not expect attachment contents to be inlined, got:\n%s", got)
	}
	// Attaching converts nothing, so the prompt has no conversion state to report.
	for _, gone := range []string{"markdown_path", "document_reader_status", "document_reader_engine", "visual_pages"} {
		if strings.Contains(got, gone) {
			t.Fatalf("%q belongs to the old import-time conversion, got:\n%s", gone, got)
		}
	}
}

// ─── buildUserMemoriesBlock ───────────────────────────────────────────────────

func TestBuildUserMemoriesBlock_Empty(t *testing.T) {
	if got := buildUserMemoriesBlock(nil); got != "" {
		t.Errorf("expected empty string for nil memories, got %q", got)
	}
	if got := buildUserMemoriesBlock([]backendmemories.UserMemory{}); got != "" {
		t.Errorf("expected empty string for zero memories, got %q", got)
	}
}

func TestBuildUserMemoriesBlock_ContainsKeyAndValue(t *testing.T) {
	mems := []backendmemories.UserMemory{
		{Type: db.MemoryTypeFact, Key: "language", Value: "French"},
	}
	got := buildUserMemoriesBlock(mems)
	if !strings.Contains(got, "language: French") {
		t.Errorf("expected 'language: French' in block, got:\n%s", got)
	}
	if !strings.Contains(got, "## User Memories") {
		t.Errorf("expected header in block, got:\n%s", got)
	}
}

func TestBuildUserMemoriesBlock_InstructionAppearsFirst(t *testing.T) {
	mems := []backendmemories.UserMemory{
		{Type: db.MemoryTypeFact, Key: "lang", Value: "Go"},
		{Type: db.MemoryTypeInstruction, Key: "style", Value: "concise"},
	}
	got := buildUserMemoriesBlock(mems)
	instrIdx := strings.Index(got, "Instructions")
	factIdx := strings.Index(got, "Facts")
	if instrIdx < 0 || factIdx < 0 {
		t.Fatalf("expected both Instructions and Facts sections, got:\n%s", got)
	}
	if instrIdx > factIdx {
		t.Errorf("Instructions section should appear before Facts section")
	}
}

func TestBuildUserMemoriesBlock_ValueOnlyEntry(t *testing.T) {
	mems := []backendmemories.UserMemory{
		{Type: db.MemoryTypePreference, Key: "", Value: "always use tabs"},
	}
	got := buildUserMemoriesBlock(mems)
	if !strings.Contains(got, "- always use tabs") {
		t.Errorf("expected value-only entry in block, got:\n%s", got)
	}
}
