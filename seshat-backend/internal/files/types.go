package files

import "time"

// File is the backend-layer view of an uploaded file.
type File struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	WorkspaceID string `json:"workspace_id,omitempty"`
	SessionID   string `json:"session_id,omitempty"`
	Category    string `json:"category,omitempty"`
	LocalPath   string `json:"local_path,omitempty"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
	SHA256      string `json:"sha256,omitempty"`
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
