package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/documentreading"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
)

const documentReaderTestTimeout = 10 * time.Second

type documentReaderDiagnostic struct {
	BaseURL                 string
	TestedAt                time.Time
	Reachable               bool
	ConversionAvailable     bool
	ConversionError         string
	HybridChunkingAvailable bool
	HybridChunkingError     string
}

type documentReaderConfigResponse struct {
	BaseURL        string `json:"base_url,omitempty"`
	Enabled        bool   `json:"enabled"`
	PreferExternal bool   `json:"prefer_external"`
	UpdatedAt      int64  `json:"updated_at,omitempty"`
}

type nativeDocDownloadState struct {
	Status          string `json:"status"`
	CurrentFile     string `json:"current_file,omitempty"`
	FileIndex       int    `json:"file_index,omitempty"`
	FileCount       int    `json:"file_count,omitempty"`
	BytesDownloaded int64  `json:"bytes_downloaded,omitempty"`
	BytesTotal      int64  `json:"bytes_total,omitempty"`
	FilesCompleted  int    `json:"files_completed,omitempty"`
	Error           string `json:"error,omitempty"`
	StartedAt       int64  `json:"started_at,omitempty"`
	UpdatedAt       int64  `json:"updated_at,omitempty"`
	CompletedAt     int64  `json:"completed_at,omitempty"`
	ModelDir        string `json:"model_dir"`
}

func documentReaderConfigToResponse(cfg *db.DocumentReaderConfig) documentReaderConfigResponse {
	if cfg == nil {
		return documentReaderConfigResponse{Enabled: true}
	}
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() && cfg.UpdatedAt.Unix() > 0 {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return documentReaderConfigResponse{
		BaseURL:        cfg.BaseURL,
		Enabled:        cfg.Enabled,
		PreferExternal: cfg.PreferExternal,
		UpdatedAt:      updatedAt,
	}
}

// GET  /api/v1/settings/document-reader
// PUT  /api/v1/settings/document-reader
// POST /api/v1/settings/document-reader/test
// GET  /api/v1/settings/document-reader/native/status
// POST /api/v1/settings/document-reader/native/download
// POST /api/v1/settings/document-reader/native/init
func (a *App) handleDocumentReaderConfig(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}

	store := a.documentReaderStore
	if store == nil {
		writeBackendError(w, bkerr.Unavailable("document reader config store not available", nil))
		return
	}

	tail := strings.TrimRight(r.URL.Path, "/")
	if strings.HasSuffix(tail, "/test") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleDocumentReaderTest(w, r, store)
		return
	}
	if strings.HasSuffix(tail, "/native/status") {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleDocumentReaderNativeStatus(w, r)
		return
	}
	if strings.HasSuffix(tail, "/native/download") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleDocumentReaderNativeDownload(w, r)
		return
	}
	if strings.HasSuffix(tail, "/native/init") {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		a.handleDocumentReaderNativeInit(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := store.Get(r.Context())
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to get document reader config", err))
			return
		}
		writeJSON(w, http.StatusOK, documentReaderConfigToResponse(cfg))

	case http.MethodPut:
		var body struct {
			BaseURL        string `json:"base_url"`
			Enabled        bool   `json:"enabled"`
			PreferExternal bool   `json:"prefer_external"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		cfg, err := store.Upsert(r.Context(), db.UpsertDocumentReaderConfigParams{
			BaseURL:        body.BaseURL,
			Enabled:        body.Enabled,
			PreferExternal: body.PreferExternal,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save document reader config: "+err.Error(), err))
			return
		}
		writeJSON(w, http.StatusOK, documentReaderConfigToResponse(cfg))

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleDocumentReaderNativeStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.nativeDocStatusResponse())
}

func (a *App) handleDocumentReaderNativeDownload(w http.ResponseWriter, r *http.Request) {
	job, started := a.startNativeDocDownload()
	status := http.StatusOK
	if started {
		status = http.StatusAccepted
	}
	writeJSON(w, status, map[string]any{
		"ok":              true,
		"already_running": !started && job.Status == "running",
		"download":        job,
		"capabilities":    nativeDocCapabilitiesResponse(documentreading.DetectCapabilities()),
	})
}

func (a *App) handleDocumentReaderNativeInit(w http.ResponseWriter, r *http.Request) {
	capabilities, err := documentreading.InitNativeDocRuntime()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                                     err == nil && capabilities.NativeDocReady,
		"error":                                  nullableError(err),
		"document_nativedoc_compiled":            capabilities.NativeDocCompiled,
		"document_nativedoc_runtime_initialized": capabilities.NativeDocRuntimeInitialized,
		"document_nativedoc_models_available":    capabilities.NativeDocModelsAvailable,
		"document_nativedoc_ready":               capabilities.NativeDocReady,
		"document_local_basic_available":         capabilities.LocalBasicAvailable,
		"document_pdfsmart_available":            capabilities.PDFSmartAvailable,
		"document_vision_fallback_configured":    capabilities.VisionFallbackConfigured,
	})
}

func (a *App) nativeDocStatusResponse() map[string]any {
	return map[string]any{
		"model_dir":    documentreading.NativeDocModelsDir(),
		"models":       documentreading.NativeDocModelFiles,
		"download":     a.nativeDocDownloadState(),
		"capabilities": nativeDocCapabilitiesResponse(documentreading.DetectCapabilities()),
	}
}

func nativeDocCapabilitiesResponse(capabilities documentreading.Capabilities) map[string]any {
	return map[string]any{
		"document_local_basic_available":         capabilities.LocalBasicAvailable,
		"document_pdfsmart_available":            capabilities.PDFSmartAvailable,
		"document_nativedoc_compiled":            capabilities.NativeDocCompiled,
		"document_nativedoc_runtime_initialized": capabilities.NativeDocRuntimeInitialized,
		"document_nativedoc_models_available":    capabilities.NativeDocModelsAvailable,
		"document_nativedoc_ready":               capabilities.NativeDocReady,
		"document_vision_fallback_configured":    capabilities.VisionFallbackConfigured,
	}
}

func (a *App) nativeDocDownloadState() nativeDocDownloadState {
	if a == nil {
		return nativeDocDownloadState{Status: "idle", ModelDir: documentreading.NativeDocModelsDir()}
	}
	a.nativeDocDownloadMu.Lock()
	defer a.nativeDocDownloadMu.Unlock()
	if a.nativeDocDownload == nil {
		return nativeDocDownloadState{Status: "idle", ModelDir: documentreading.NativeDocModelsDir()}
	}
	return *a.nativeDocDownload
}

func (a *App) startNativeDocDownload() (nativeDocDownloadState, bool) {
	if a == nil {
		return nativeDocDownloadState{Status: "failed", Error: "app unavailable", ModelDir: documentreading.NativeDocModelsDir()}, false
	}
	now := time.Now().Unix()
	a.nativeDocDownloadMu.Lock()
	if a.nativeDocDownload != nil && a.nativeDocDownload.Status == "running" {
		job := *a.nativeDocDownload
		a.nativeDocDownloadMu.Unlock()
		return job, false
	}
	a.nativeDocDownload = &nativeDocDownloadState{
		Status:    "running",
		StartedAt: now,
		UpdatedAt: now,
		ModelDir:  documentreading.NativeDocModelsDir(),
	}
	job := *a.nativeDocDownload
	a.nativeDocDownloadMu.Unlock()

	go a.runNativeDocDownload()
	return job, true
}

func (a *App) runNativeDocDownload() {
	err := documentreading.DownloadNativeDocModels(context.Background(), func(progress documentreading.NativeDocDownloadProgress) {
		a.nativeDocDownloadMu.Lock()
		defer a.nativeDocDownloadMu.Unlock()
		if a.nativeDocDownload == nil {
			return
		}
		a.nativeDocDownload.Status = "running"
		a.nativeDocDownload.CurrentFile = progress.File
		a.nativeDocDownload.FileIndex = progress.FileIndex
		a.nativeDocDownload.FileCount = progress.FileCount
		a.nativeDocDownload.BytesDownloaded = progress.BytesDownloaded
		a.nativeDocDownload.BytesTotal = progress.BytesTotal
		if progress.AlreadyAvailable {
			a.nativeDocDownload.FilesCompleted = progress.FileIndex
		} else if progress.BytesTotal > 0 && progress.BytesDownloaded >= progress.BytesTotal {
			a.nativeDocDownload.FilesCompleted = progress.FileIndex
		}
		a.nativeDocDownload.UpdatedAt = time.Now().Unix()
	})
	now := time.Now().Unix()
	a.nativeDocDownloadMu.Lock()
	defer a.nativeDocDownloadMu.Unlock()
	if a.nativeDocDownload == nil {
		return
	}
	a.nativeDocDownload.UpdatedAt = now
	a.nativeDocDownload.CompletedAt = now
	if err != nil {
		a.nativeDocDownload.Status = "failed"
		a.nativeDocDownload.Error = err.Error()
		return
	}
	a.nativeDocDownload.Status = "completed"
	a.nativeDocDownload.Error = ""
	a.nativeDocDownload.FilesCompleted = len(documentreading.NativeDocModelFiles)
}

func (a *App) handleDocumentReaderTest(w http.ResponseWriter, r *http.Request, store *db.DocumentReaderConfigStore) {
	var body struct {
		BaseURL string `json:"base_url"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	baseURL := strings.TrimSpace(body.BaseURL)
	if baseURL == "" {
		if cfg, err := store.Get(r.Context()); err == nil && cfg != nil {
			baseURL = cfg.BaseURL
		}
	}

	if baseURL == "" {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": 0,
			"error":      "base_url is required",
		})
		return
	}

	client, err := documentreading.NewSeshatIntelligenceClientWithTimeout(baseURL, documentReaderTestTimeout)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         false,
			"latency_ms": 0,
			"error":      err.Error(),
		})
		return
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(r.Context(), documentReaderTestTimeout)
	defer cancel()
	available := client.IsAvailable(ctx)
	conversionAvailable := false
	hybridChunkingAvailable := false
	var conversionErr string
	var hybridErr string
	if available {
		conversionAvailable, conversionErr = probeDocumentReaderConversion(ctx, client)
		hybridChunkingAvailable, hybridErr = probeDocumentReaderHybridChunking(ctx, client)
	}
	latency := time.Since(start).Milliseconds()

	if !available {
		diagnostic := documentReaderDiagnostic{
			BaseURL:  baseURL,
			TestedAt: time.Now(),
		}
		a.setDocumentReaderDiagnostic(diagnostic)
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":                                  false,
			"latency_ms":                          latency,
			"error":                               "document reader is not reachable at this URL",
			"document_reader_reachable":           false,
			"document_conversion_available":       false,
			"document_hybrid_chunking_configured": false,
		})
		return
	}
	diagnostic := documentReaderDiagnostic{
		BaseURL:                 baseURL,
		TestedAt:                time.Now(),
		Reachable:               true,
		ConversionAvailable:     conversionAvailable,
		ConversionError:         conversionErr,
		HybridChunkingAvailable: hybridChunkingAvailable,
		HybridChunkingError:     hybridErr,
	}
	a.setDocumentReaderDiagnostic(diagnostic)
	ok := conversionAvailable
	errorMessage := ""
	if !conversionAvailable {
		errorMessage = "document reader is reachable, but conversion failed"
		if conversionErr != "" {
			errorMessage += ": " + conversionErr
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                                  ok,
		"latency_ms":                          latency,
		"error":                               nullableString(errorMessage),
		"document_reader_reachable":           true,
		"document_conversion_available":       conversionAvailable,
		"document_conversion_error":           nullableString(conversionErr),
		"document_hybrid_chunking_configured": hybridChunkingAvailable,
		"document_hybrid_chunking_error":      nullableString(hybridErr),
	})
}

func (a *App) setDocumentReaderDiagnostic(diagnostic documentReaderDiagnostic) {
	if a == nil {
		return
	}
	a.documentReaderDiagMu.Lock()
	defer a.documentReaderDiagMu.Unlock()
	a.documentReaderDiag = &diagnostic
}

func (a *App) documentReaderDiagnosticFor(baseURL string) (documentReaderDiagnostic, bool) {
	if a == nil {
		return documentReaderDiagnostic{}, false
	}
	a.documentReaderDiagMu.Lock()
	defer a.documentReaderDiagMu.Unlock()
	if a.documentReaderDiag == nil {
		return documentReaderDiagnostic{}, false
	}
	diagnostic := *a.documentReaderDiag
	if strings.TrimRight(strings.TrimSpace(diagnostic.BaseURL), "/") != strings.TrimRight(strings.TrimSpace(baseURL), "/") {
		return documentReaderDiagnostic{}, false
	}
	return diagnostic, true
}

func probeDocumentReaderConversion(ctx context.Context, client documentreader.Converter) (bool, string) {
	result, err := client.ConvertBytes(ctx, []byte("Seshat document reader test.\n"), "seshat-document-reader-test.txt")
	if err != nil {
		return false, err.Error()
	}
	if result == nil || strings.TrimSpace(result.Markdown) == "" {
		return false, "conversion returned empty markdown"
	}
	return true, ""
}

func probeDocumentReaderHybridChunking(ctx context.Context, client documentreader.Converter) (bool, string) {
	chunker, ok := client.(documentreader.HybridChunker)
	if !ok {
		return false, "client does not expose hybrid chunking"
	}
	chunks, err := chunker.ChunkHybridBytes(ctx, []byte("Seshat document reader chunking test.\n"), "seshat-document-reader-test.txt", documentreader.ChunkOptions{})
	if err != nil {
		return false, err.Error()
	}
	if len(chunks) == 0 {
		return false, "chunking returned no chunks"
	}
	return true, ""
}

func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func nullableError(err error) any {
	if err == nil {
		return nil
	}
	return err.Error()
}
