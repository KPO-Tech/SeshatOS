package api

import (
	"net/http"
	"strings"

	backendaudit "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
)

// corpusResponse is the JSON shape returned to clients.
type corpusResponse struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	WorkspaceID string `json:"workspace_id,omitempty"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	ChunkCount  int    `json:"chunk_count"`
	CreatedAt   int64  `json:"created_at"`
	UpdatedAt   int64  `json:"updated_at"`
}

type corpusFileResponse struct {
	CorpusID   string `json:"corpus_id"`
	FileID     string `json:"file_id"`
	Filename   string `json:"filename"`
	Status     string `json:"status"`
	ChunkCount int    `json:"chunk_count"`
	IngestedAt *int64 `json:"ingested_at,omitempty"`
	CreatedAt  int64  `json:"created_at"`
}

type ingestionJobResponse struct {
	ID           string `json:"id"`
	CorpusID     string `json:"corpus_id"`
	FileID       string `json:"file_id"`
	UserID       string `json:"user_id"`
	WorkspaceID  string `json:"workspace_id,omitempty"`
	Filename     string `json:"filename"`
	Status       string `json:"status"`
	AttemptCount int    `json:"attempt_count"`
	MaxAttempts  int    `json:"max_attempts"`
	ChunkCount   int    `json:"chunk_count"`
	LastError    string `json:"last_error,omitempty"`
	ErrorLog     string `json:"error_log,omitempty"`
	NextRunAt    *int64 `json:"next_run_at,omitempty"`
	StartedAt    *int64 `json:"started_at,omitempty"`
	CompletedAt  *int64 `json:"completed_at,omitempty"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

func corpusToResponse(c knowledge.Corpus) corpusResponse {
	return corpusResponse{
		ID:          c.ID,
		UserID:      c.UserID,
		WorkspaceID: c.WorkspaceID,
		Name:        c.Name,
		Description: c.Description,
		ChunkCount:  c.ChunkCount,
		CreatedAt:   c.CreatedAt.Unix(),
		UpdatedAt:   c.UpdatedAt.Unix(),
	}
}

func corpusFileToResponse(cf knowledge.CorpusFile) corpusFileResponse {
	r := corpusFileResponse{
		CorpusID:   cf.CorpusID,
		FileID:     cf.FileID,
		Filename:   cf.Filename,
		Status:     cf.Status,
		ChunkCount: cf.ChunkCount,
		CreatedAt:  cf.CreatedAt.Unix(),
	}
	if cf.IngestedAt != nil {
		ts := cf.IngestedAt.Unix()
		r.IngestedAt = &ts
	}
	return r
}

func ingestionJobToResponse(job knowledge.IngestionJob) ingestionJobResponse {
	resp := ingestionJobResponse{
		ID:           job.ID,
		CorpusID:     job.CorpusID,
		FileID:       job.FileID,
		UserID:       job.UserID,
		WorkspaceID:  job.WorkspaceID,
		Filename:     job.Filename,
		Status:       job.Status,
		AttemptCount: job.AttemptCount,
		MaxAttempts:  job.MaxAttempts,
		ChunkCount:   job.ChunkCount,
		LastError:    job.LastError,
		ErrorLog:     job.ErrorLog,
		CreatedAt:    job.CreatedAt.Unix(),
		UpdatedAt:    job.UpdatedAt.Unix(),
	}
	if job.NextRunAt != nil {
		ts := job.NextRunAt.Unix()
		resp.NextRunAt = &ts
	}
	if job.StartedAt != nil {
		ts := job.StartedAt.Unix()
		resp.StartedAt = &ts
	}
	if job.CompletedAt != nil {
		ts := job.CompletedAt.Unix()
		resp.CompletedAt = &ts
	}
	return resp
}

// handleCorpora handles POST /corpora and GET /corpora
func (a *App) handleCorpora(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	switch r.Method {
	case http.MethodGet:
		corpora, err := a.backend.Knowledge.ListCorpora(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		items := make([]corpusResponse, 0, len(corpora))
		for _, c := range corpora {
			items = append(items, corpusToResponse(c))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"corpora": items,
			"count":   len(items),
		})

	case http.MethodPost:
		var body struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			WorkspaceID string `json:"workspace_id"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.Name) == "" {
			writeJSONError(w, http.StatusBadRequest, "name is required")
			return
		}
		if len(body.Name) > 255 {
			writeJSONError(w, http.StatusBadRequest, "name exceeds maximum length (255 chars)")
			return
		}
		if len(body.Description) > 1024 {
			writeJSONError(w, http.StatusBadRequest, "description exceeds maximum length (1024 chars)")
			return
		}
		corpus, err := a.backend.Knowledge.CreateCorpus(r.Context(), principal, knowledge.CreateCorpusParams{
			Name:        body.Name,
			Description: body.Description,
			WorkspaceID: body.WorkspaceID,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionCorpusCreate,
			ResourceType: "corpus",
			ResourceID:   corpus.ID,
			IPAddress:    a.clientIP(r),
		})
		writeJSON(w, http.StatusCreated, corpusToResponse(*corpus))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleCorpusByID handles /corpora/{id} and sub-paths:
//
//	GET    /corpora/{id}              → corpus metadata
//	DELETE /corpora/{id}              → delete corpus
//	POST   /corpora/{id}/files        → attach file
//	GET    /corpora/{id}/files        → list attached files
//	DELETE /corpora/{id}/files/{fid}  → detach file
//	POST   /corpora/{id}/ingest       → enqueue an ingest job
//	GET    /corpora/{id}/ingest/jobs  → list ingest jobs
//	GET    /corpora/{id}/ingest/jobs/{jid} → get one ingest job
//	POST   /corpora/{id}/ingest/jobs/{jid}/retry → retry a failed ingest job
//	POST   /corpora/{id}/search       → search the corpus
func (a *App) handleCorpusByID(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Strip prefix to get the rest of the path.
	rest := strings.TrimPrefix(r.URL.Path, "/corpora/")
	rest = strings.Trim(rest, "/")
	if rest == "" {
		writeJSONError(w, http.StatusBadRequest, "corpus id is required")
		return
	}

	parts := strings.Split(rest, "/")
	corpusID := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			corpus, err := a.backend.Knowledge.GetCorpus(r.Context(), principal, corpusID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, corpusToResponse(*corpus))
		case http.MethodPut:
			var body struct {
				Name        string `json:"name"`
				Description string `json:"description"`
			}
			if !decodeJSONBody(w, r, &body) {
				return
			}
			if strings.TrimSpace(body.Name) == "" {
				writeJSONError(w, http.StatusBadRequest, "name is required")
				return
			}
			if len(body.Name) > 255 {
				writeJSONError(w, http.StatusBadRequest, "name exceeds maximum length (255 chars)")
				return
			}
			if len(body.Description) > 1024 {
				writeJSONError(w, http.StatusBadRequest, "description exceeds maximum length (1024 chars)")
				return
			}
			corpus, err := a.backend.Knowledge.UpdateCorpus(r.Context(), principal, corpusID, knowledge.UpdateCorpusParams{
				Name:        body.Name,
				Description: body.Description,
			})
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, corpusToResponse(*corpus))
		case http.MethodDelete:
			if err := a.backend.Knowledge.DeleteCorpus(r.Context(), principal, corpusID); err != nil {
				writeBackendError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	sub := parts[1]
	switch sub {
	case "files":
		a.handleCorpusFiles(w, r, corpusID, parts)
	case "ingest":
		a.handleCorpusIngest(w, r, corpusID, parts)
	case "search":
		a.handleCorpusSearch(w, r, corpusID)
	default:
		writeJSONError(w, http.StatusNotFound, "unknown sub-resource")
	}
}

func (a *App) handleCorpusFiles(w http.ResponseWriter, r *http.Request, corpusID string, parts []string) {
	principal, _ := authPrincipalFromContext(r.Context())

	if len(parts) == 3 {
		fileID := parts[2]
		switch r.Method {
		case http.MethodDelete:
			if err := a.backend.Knowledge.DetachFile(r.Context(), principal, corpusID, fileID); err != nil {
				writeBackendError(w, err)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
		return
	}

	switch r.Method {
	case http.MethodGet:
		files, err := a.backend.Knowledge.ListFiles(r.Context(), principal, corpusID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		items := make([]corpusFileResponse, 0, len(files))
		for _, f := range files {
			items = append(items, corpusFileToResponse(f))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"files": items,
			"count": len(items),
		})
	case http.MethodPost:
		var body struct {
			FileID string `json:"file_id"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if strings.TrimSpace(body.FileID) == "" {
			writeJSONError(w, http.StatusBadRequest, "file_id is required")
			return
		}
		cf, err := a.backend.Knowledge.AttachFile(r.Context(), principal, corpusID, body.FileID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, corpusFileToResponse(*cf))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleCorpusIngest(w http.ResponseWriter, r *http.Request, corpusID string, parts []string) {
	principal, _ := authPrincipalFromContext(r.Context())

	if len(parts) >= 3 && parts[2] == "jobs" {
		a.handleCorpusIngestJobs(w, r, principal, corpusID, parts)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		FileID string `json:"file_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.FileID) == "" {
		writeJSONError(w, http.StatusBadRequest, "file_id is required")
		return
	}

	job, err := a.backend.Knowledge.EnqueueIngest(r.Context(), principal, knowledge.IngestParams{
		CorpusID: corpusID,
		FileID:   body.FileID,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	if principal != nil {
		a.backend.Audit.Log(r.Context(), backendaudit.LogParams{
			ActorUserID:  principal.User.ID,
			Action:       backendaudit.ActionKnowledgeIngest,
			ResourceType: "corpus",
			ResourceID:   corpusID,
			IPAddress:    a.clientIP(r),
			Metadata:     map[string]any{"file_id": body.FileID, "job_id": job.ID},
		})
	}
	writeJSON(w, http.StatusAccepted, ingestionJobToResponse(*job))
}

func (a *App) handleCorpusIngestJobs(w http.ResponseWriter, r *http.Request, principal *backendauth.Principal, corpusID string, parts []string) {
	if len(parts) == 3 {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		jobs, err := a.backend.Knowledge.ListIngestionJobs(r.Context(), principal, corpusID)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		items := make([]ingestionJobResponse, 0, len(jobs))
		for _, job := range jobs {
			items = append(items, ingestionJobToResponse(job))
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"jobs":  items,
			"count": len(items),
		})
		return
	}

	if len(parts) >= 4 {
		jobID := parts[3]
		if len(parts) == 4 {
			if r.Method != http.MethodGet {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			job, err := a.backend.Knowledge.GetIngestionJob(r.Context(), principal, corpusID, jobID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, ingestionJobToResponse(*job))
			return
		}
		if len(parts) == 5 && parts[4] == "retry" {
			if r.Method != http.MethodPost {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}
			job, err := a.backend.Knowledge.RetryIngestionJob(r.Context(), principal, corpusID, jobID)
			if err != nil {
				writeBackendError(w, err)
				return
			}
			writeJSON(w, http.StatusAccepted, ingestionJobToResponse(*job))
			return
		}
	}

	writeJSONError(w, http.StatusNotFound, "unknown ingestion job resource")
}

func (a *App) handleCorpusSearch(w http.ResponseWriter, r *http.Request, corpusID string) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())

	var body struct {
		Query string `json:"query"`
		TopK  int    `json:"top_k"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Query) == "" {
		writeJSONError(w, http.StatusBadRequest, "query is required")
		return
	}

	resp, err := a.backend.Knowledge.Search(r.Context(), principal, knowledge.SearchParams{
		CorpusID: corpusID,
		Query:    body.Query,
		TopK:     body.TopK,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// handleKnowledgeSearch handles POST /knowledge/search: a raw (non-agentic)
// search across every corpus the principal can access, merged and ranked by
// score via knowledge.SearchAll - the same function the knowledge_search
// agent tool uses, so the Knowledge app's raw-results panel and its agent
// answer are always ranking the same underlying chunks.
func (a *App) handleKnowledgeSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Query    string `json:"query"`
		TopK     int    `json:"top_k"`
		CorpusID string `json:"corpus_id"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if strings.TrimSpace(body.Query) == "" {
		writeJSONError(w, http.StatusBadRequest, "query is required")
		return
	}

	res, err := knowledge.SearchAll(r.Context(), principal, a.backend.Knowledge, knowledge.SearchAllParams{
		Query:    body.Query,
		TopK:     body.TopK,
		CorpusID: body.CorpusID,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}
