package knowledge

import "time"

type Corpus struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	WorkspaceID string    `json:"workspace_id,omitempty"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	ChunkCount  int       `json:"chunk_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CorpusFile struct {
	CorpusID   string     `json:"corpus_id"`
	FileID     string     `json:"file_id"`
	Filename   string     `json:"filename"`
	Status     string     `json:"status"` // pending / ingested / failed
	ChunkCount int        `json:"chunk_count"`
	IngestedAt *time.Time `json:"ingested_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// DownloadedFile carries a corpus file's raw bytes and the metadata needed
// to serve them (Content-Type/Content-Disposition) - kept separate from
// CorpusFile since content type isn't part of that API-facing type.
type DownloadedFile struct {
	Data        []byte
	Filename    string
	ContentType string
}

type CreateCorpusParams struct {
	Name        string
	Description string
	WorkspaceID string // optional
}

type UpdateCorpusParams struct {
	Name        string
	Description string
}

type IngestParams struct {
	CorpusID string
	FileID   string
}

// ExternalIngestParams is IngestExternal's input - text pulled live from a
// Knowledge connector rather than an already-uploaded db.File.
type ExternalIngestParams struct {
	CorpusID string
	// ExternalID is a synthetic FileID identifying this resource at its
	// source (e.g. "gdrive-{driveFileID}") - stable across re-syncs so a
	// re-ingest replaces the same corpus_files/vector rows in place.
	ExternalID string
	Filename   string
	Text       string
	// AccessControl lists the identities allowed to see this resource
	// (e.g. "user:alice@example.com", "group:eng-team"), mirroring the
	// source system's own permissions. Empty falls back to the corpus's
	// own scope (workspace, else owner) - see IngestExternal's doc comment.
	AccessControl []string
}

type IngestionJob struct {
	ID           string     `json:"id"`
	CorpusID     string     `json:"corpus_id"`
	FileID       string     `json:"file_id"`
	UserID       string     `json:"user_id"`
	WorkspaceID  string     `json:"workspace_id,omitempty"`
	Filename     string     `json:"filename"`
	Status       string     `json:"status"`
	AttemptCount int        `json:"attempt_count"`
	MaxAttempts  int        `json:"max_attempts"`
	ChunkCount   int        `json:"chunk_count"`
	LastError    string     `json:"last_error,omitempty"`
	ErrorLog     string     `json:"error_log,omitempty"`
	NextRunAt    *time.Time `json:"next_run_at,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type SearchParams struct {
	CorpusID string
	Query    string
	TopK     int
}
