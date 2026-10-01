// Package cloudknowledge makes seshat-backend's Documents tab a real client
// of seshat-server in "connected" mode. RemoteService (service.go)
// implements the same internal/knowledge.Backend interface *knowledge.Service
// implements for standalone mode, so swapping one for the other in
// internal/app.go is a one-line change (see internal/config/bootstrap.go).
//
// Unlike cloudmcp (which merges a local list with an approved org catalog)
// this is a clean swap, not a merge: in connected mode there is exactly one
// set of corpora — the organization's — not "local corpora plus org
// corpora." seshat-server already runs the full chunk/embed/vector-search
// pipeline for these corpora server-side (internal/server/knowledge); this
// package only has to move the HTTP calls, not reimplement any of that.
package cloudknowledge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	"github.com/KPO-Tech/seshat/pkg/rag"
)

// ─── Wire DTOs ──────────────────────────────────────────────────────────────
// Mirrors seshat-server's internal/server/knowledge.{Corpus,CorpusFile,
// IngestionJob} JSON shape. Not the same Go types — seshat-server is a
// separate module, there is nothing to import — just matching field/tag
// names so json.Decode lines up.

type remoteCorpus struct {
	ID              string    `json:"id"`
	OrganizationID  string    `json:"organization_id"`
	CreatedByUserID string    `json:"created_by_user_id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	ChunkCount      int       `json:"chunk_count"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type remoteCorpusFile struct {
	ID          string     `json:"id"`
	CorpusID    string     `json:"corpus_id"`
	Filename    string     `json:"filename"`
	ContentType string     `json:"content_type"`
	Size        int64      `json:"size"`
	Status      string     `json:"status"`
	ChunkCount  int        `json:"chunk_count"`
	IngestedAt  *time.Time `json:"ingested_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type remoteIngestionJob struct {
	ID           string     `json:"id"`
	CorpusID     string     `json:"corpus_id"`
	CorpusFileID string     `json:"corpus_file_id"`
	Filename     string     `json:"filename"`
	Status       string     `json:"status"`
	AttemptCount int        `json:"attempt_count"`
	MaxAttempts  int        `json:"max_attempts"`
	ChunkCount   int        `json:"chunk_count"`
	LastError    string     `json:"last_error,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

// ─── Client ─────────────────────────────────────────────────────────────────

// Client is a thin, stateless HTTP client for seshat-server's
// /api/v1/knowledge/* endpoints — same convention as every other cloud*
// client: no fixed token, each call takes the caller's own session token
// explicitly, since a single seshat-backend process can serve multiple
// local user accounts concurrently.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) corporaURL(corpusID string) string {
	return c.serverURL + "/api/v1/knowledge/corpora/" + url.PathEscape(corpusID)
}

func (c *Client) ListCorpora(ctx context.Context, token, organizationID string) ([]remoteCorpus, error) {
	q := url.Values{"organization_id": {organizationID}}
	var result struct {
		Corpora []remoteCorpus `json:"corpora"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/knowledge/corpora?"+q.Encode(), token, nil, &result); err != nil {
		return nil, err
	}
	return result.Corpora, nil
}

func (c *Client) CreateCorpus(ctx context.Context, token, organizationID, name, description string) (*remoteCorpus, error) {
	var result remoteCorpus
	body := map[string]any{"organization_id": organizationID, "name": name, "description": description}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/knowledge/corpora", token, body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) GetCorpus(ctx context.Context, token, corpusID string) (*remoteCorpus, error) {
	var result remoteCorpus
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.corporaURL(corpusID), token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) UpdateCorpus(ctx context.Context, token, corpusID, name, description string) (*remoteCorpus, error) {
	var result remoteCorpus
	body := map[string]any{"name": name, "description": description}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPut, c.corporaURL(corpusID), token, body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) DeleteCorpus(ctx context.Context, token, corpusID string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.corporaURL(corpusID), token, nil, nil)
	return err
}

func (c *Client) ListFiles(ctx context.Context, token, corpusID string) ([]remoteCorpusFile, error) {
	var result struct {
		Files []remoteCorpusFile `json:"files"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.corporaURL(corpusID)+"/files", token, nil, &result); err != nil {
		return nil, err
	}
	return result.Files, nil
}

func (c *Client) DetachFile(ctx context.Context, token, corpusID, fileID string) error {
	_, err := cloudhttp.Do(ctx, c.httpClient, http.MethodDelete, c.corporaURL(corpusID)+"/files/"+url.PathEscape(fileID), token, nil, nil)
	return err
}

func (c *Client) ListIngestionJobs(ctx context.Context, token, corpusID string) ([]remoteIngestionJob, error) {
	var result struct {
		Jobs []remoteIngestionJob `json:"ingestion_jobs"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.corporaURL(corpusID)+"/ingestion-jobs", token, nil, &result); err != nil {
		return nil, err
	}
	return result.Jobs, nil
}

func (c *Client) GetIngestionJob(ctx context.Context, token, corpusID, jobID string) (*remoteIngestionJob, error) {
	var result remoteIngestionJob
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.corporaURL(corpusID)+"/ingestion-jobs/"+url.PathEscape(jobID), token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) RetryIngestionJob(ctx context.Context, token, corpusID, jobID string) (*remoteIngestionJob, error) {
	var result remoteIngestionJob
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.corporaURL(corpusID)+"/ingestion-jobs/"+url.PathEscape(jobID)+"/retry", token, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *Client) Search(ctx context.Context, token, corpusID, query string, topK int) (*rag.SearchResponse, error) {
	var result rag.SearchResponse
	body := map[string]any{"query": query, "top_k": topK}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.corporaURL(corpusID)+"/search", token, body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DownloadFile fetches a corpus file's raw bytes by its own id alone -
// GET /api/v1/knowledge/files/{fileID}/content is deliberately not
// corpus-scoped in the path, since the caller (RemoteService.DownloadFile)
// only ever has the id it got back from AttachFile/ListFiles to go on. The
// server sets Content-Type/Content-Disposition the same way the desktop's
// own local file-content endpoint does, so those are read back here rather
// than re-fetching CorpusFile metadata in a second round trip.
func (c *Client) DownloadFile(ctx context.Context, token, fileID string) ([]byte, *remoteCorpusFile, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.serverURL+"/api/v1/knowledge/files/"+url.PathEscape(fileID)+"/content", nil)
	if err != nil {
		return nil, nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("seshat-server unreachable: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("read response body: %w", err)
	}
	if resp.StatusCode >= 400 {
		return nil, nil, &cloudhttp.HTTPError{Status: resp.StatusCode, Body: strings.TrimSpace(string(data))}
	}

	filename := ""
	if _, params, err := mime.ParseMediaType(resp.Header.Get("Content-Disposition")); err == nil {
		filename = params["filename"]
	}
	return data, &remoteCorpusFile{Filename: filename, ContentType: resp.Header.Get("Content-Type")}, nil
}

// UploadFile uploads file bytes as a multipart form to
// POST /corpora/{corpusID}/files, which attaches AND enqueues ingestion
// server-side in one call — there is no separate "attach existing file" or
// "enqueue ingest" endpoint on seshat-server the way there is locally,
// since seshat-server has no notion of a file that exists independently of
// a corpus. cloudhttp.Do only JSON-encodes, so this builds the multipart
// request by hand but reuses the same *cloudhttp.HTTPError shape on failure
// so callers can keep using cloudhttp.Translate uniformly.
func (c *Client) UploadFile(ctx context.Context, token, corpusID, filename, contentType string, data []byte) (*remoteCorpusFile, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile("file", filename)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(data); err != nil {
		return nil, err
	}
	if err := mw.Close(); err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.corporaURL(corpusID)+"/files", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, &cloudhttp.HTTPError{Status: resp.StatusCode, Body: strings.TrimSpace(string(raw))}
	}
	var result remoteCorpusFile
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return &result, nil
}
