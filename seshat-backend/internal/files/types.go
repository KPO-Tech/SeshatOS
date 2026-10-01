package files

import "time"

// File is the backend-layer view of an uploaded file.
type File struct {
	ID           string `json:"id"`
	UserID       string `json:"user_id"`
	WorkspaceID  string `json:"workspace_id,omitempty"`
	SessionID    string `json:"session_id,omitempty"`
	Category     string `json:"category,omitempty"`
	LocalPath    string `json:"local_path,omitempty"`
	MarkdownPath string `json:"markdown_path,omitempty"` // set when document conversion succeeded
	// DocumentReadStatus is empty for non-convertible files, or one of
	// processing, converted, failed for files that need a normalized read
	// result for previews, chat tools or Knowledge ingestion.
	DocumentReadStatus string `json:"document_read_status,omitempty"`
	DocumentReadEngine string `json:"document_read_engine,omitempty"`
	DocumentReadPages  int    `json:"document_read_pages,omitempty"`
	DocumentReadImages int    `json:"document_read_images,omitempty"`
	// DocumentReadVisualPages lists 1-indexed pages with detected visual
	// content. Today this is populated from embedded PDF images; future layout
	// detectors can add diagram/table-heavy pages here too.
	DocumentReadVisualPages []int  `json:"document_read_visual_pages,omitempty"`
	Filename                string `json:"filename"`
	ContentType             string `json:"content_type"`
	Size                    int64  `json:"size"`
	SHA256                  string `json:"sha256,omitempty"`
	// UserMessageIndex, when set, is the 0-based position of this file's
	// owning user message within its session's transcript. See
	// db.File.UserMessageIndex.
	UserMessageIndex *int      `json:"user_message_index,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type UploadFileParams struct {
	Filename    string
	ContentType string
	Data        []byte
	WorkspaceID string // optional
}

const (
	CategoryImages    = "images"
	CategoryDocuments = "documents"
	CategoryAudio     = "audio"
	CategoryOther     = "other"
)

// Which extensions get an eagerly-converted markdown sidecar on upload is
// now decided by internal/documentreading.AllConvertibleExtensions - it's the
// single source of truth shared with knowledge.Service's RAG ingestion path,
// instead of each maintaining its own near-duplicate list.
