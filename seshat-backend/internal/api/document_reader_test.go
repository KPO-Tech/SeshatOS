package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
)

func TestHandleDocumentReaderTestProbesConversionAndHybridChunking(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/v1/documents":
			_ = r.ParseMultipartForm(1 << 20)
			writeJSON(w, http.StatusOK, map[string]any{
				"status":   "success",
				"markdown": "Seshat document reader test.",
			})
		case "/v1/documents/chunks":
			_ = r.ParseMultipartForm(1 << 20)
			writeJSON(w, http.StatusOK, map[string]any{
				"filename": "seshat-document-reader-test.txt",
				"chunks": []map[string]any{{
					"index": 0,
					"text":  "Seshat document reader chunking test.",
				}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	body := bytes.NewBufferString(`{"base_url":` + strconvQuote(server.URL) + `}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/document-reader/test", body)
	rec := httptest.NewRecorder()

	(&App{}).handleDocumentReaderTest(rec, req, nil)

	var resp struct {
		OK                               bool    `json:"ok"`
		Error                            *string `json:"error"`
		DocumentReaderReachable          bool    `json:"document_reader_reachable"`
		DocumentConversionAvailable      bool    `json:"document_conversion_available"`
		DocumentConversionError          *string `json:"document_conversion_error"`
		DocumentHybridChunkingConfigured bool    `json:"document_hybrid_chunking_configured"`
		DocumentHybridChunkingError      *string `json:"document_hybrid_chunking_error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.OK {
		t.Fatalf("expected ok=true, got error=%v", resp.Error)
	}
	if !resp.DocumentReaderReachable || !resp.DocumentConversionAvailable || !resp.DocumentHybridChunkingConfigured {
		t.Fatalf("expected all document reader capabilities true, got %+v", resp)
	}
	if resp.DocumentConversionError != nil || resp.DocumentHybridChunkingError != nil {
		t.Fatalf("expected nil capability errors, got %+v", resp)
	}
}

func TestHandleDocumentReaderTestReportsPartialCapability(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/health":
			w.WriteHeader(http.StatusOK)
		case "/v1/documents":
			writeJSON(w, http.StatusOK, map[string]any{
				"status":   "success",
				"markdown": "Seshat document reader test.",
			})
		case "/v1/documents/chunks":
			http.Error(w, "chunker disabled", http.StatusNotImplemented)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	body := bytes.NewBufferString(`{"base_url":` + strconvQuote(server.URL) + `}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/document-reader/test", body)
	rec := httptest.NewRecorder()

	(&App{}).handleDocumentReaderTest(rec, req, nil)

	var resp struct {
		OK                               bool    `json:"ok"`
		Error                            *string `json:"error"`
		DocumentReaderReachable          bool    `json:"document_reader_reachable"`
		DocumentConversionAvailable      bool    `json:"document_conversion_available"`
		DocumentHybridChunkingConfigured bool    `json:"document_hybrid_chunking_configured"`
		DocumentHybridChunkingError      *string `json:"document_hybrid_chunking_error"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.OK {
		t.Fatalf("expected ok=true when conversion works, got error=%v", resp.Error)
	}
	if !resp.DocumentReaderReachable || !resp.DocumentConversionAvailable {
		t.Fatalf("expected health and conversion to be available, got %+v", resp)
	}
	if resp.DocumentHybridChunkingConfigured {
		t.Fatalf("expected hybrid chunking to be unavailable, got %+v", resp)
	}
	if resp.DocumentHybridChunkingError == nil || *resp.DocumentHybridChunkingError == "" {
		t.Fatalf("expected a chunking error, got %+v", resp)
	}
}

func TestHandleDocumentReaderNativeInitReportsCapabilityState(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/document-reader/native/init", nil)
	rec := httptest.NewRecorder()

	(&App{}).handleDocumentReaderNativeInit(rec, req)

	var resp struct {
		OK                               bool    `json:"ok"`
		Error                            *string `json:"error"`
		DocumentNativeDocCompiled        bool    `json:"document_nativedoc_compiled"`
		DocumentNativeDocModelsAvailable bool    `json:"document_nativedoc_models_available"`
		DocumentNativeDocReady           bool    `json:"document_nativedoc_ready"`
		DocumentPDFSmartAvailable        bool    `json:"document_pdfsmart_available"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.OK != resp.DocumentNativeDocReady {
		t.Fatalf("expected ok to match nativedoc readiness, got %+v", resp)
	}
	if !resp.DocumentPDFSmartAvailable {
		t.Fatalf("expected pdfsmart capability to remain available, got %+v", resp)
	}
	if !resp.DocumentNativeDocReady && resp.Error == nil {
		t.Fatalf("expected an explanatory error when nativedoc is not ready, got %+v", resp)
	}
}

func TestHandleDocumentReaderNativeStatusReportsModelDirectory(t *testing.T) {
	modelDir := t.TempDir()
	t.Setenv(documentreading.EnvNativeDocModelsDir, modelDir)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/document-reader/native/status", nil)
	rec := httptest.NewRecorder()

	(&App{}).handleDocumentReaderNativeStatus(rec, req)

	var resp struct {
		ModelDir string                 `json:"model_dir"`
		Models   []string               `json:"models"`
		Download nativeDocDownloadState `json:"download"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ModelDir != modelDir {
		t.Fatalf("expected model dir %q, got %q", modelDir, resp.ModelDir)
	}
	if len(resp.Models) != len(documentreading.NativeDocModelFiles) {
		t.Fatalf("expected %d model files, got %d", len(documentreading.NativeDocModelFiles), len(resp.Models))
	}
	if resp.Download.Status != "idle" || resp.Download.ModelDir != modelDir {
		t.Fatalf("unexpected download status: %+v", resp.Download)
	}
}

func TestHandleDocumentReaderNativeDownloadInstallsModels(t *testing.T) {
	modelBytes := bytes.Repeat([]byte("m"), 2048)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, name := range documentreading.NativeDocModelFiles {
			if r.URL.Path == "/"+name {
				w.Write(modelBytes)
				return
			}
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	modelDir := t.TempDir()
	t.Setenv(documentreading.EnvNativeDocModelsDir, modelDir)
	t.Setenv(documentreading.EnvNativeDocModelsBaseURL, server.URL)

	app := &App{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/document-reader/native/download", nil)
	rec := httptest.NewRecorder()
	app.handleDocumentReaderNativeDownload(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 starting download, got %d: %s", rec.Code, rec.Body.String())
	}

	deadline := time.Now().Add(2 * time.Second)
	for {
		state := app.nativeDocDownloadState()
		if state.Status == "completed" {
			break
		}
		if state.Status == "failed" {
			t.Fatalf("download failed: %+v", state)
		}
		if time.Now().After(deadline) {
			t.Fatalf("download did not complete, last state: %+v", state)
		}
		time.Sleep(10 * time.Millisecond)
	}
	for _, name := range documentreading.NativeDocModelFiles {
		if !fileLargerThan(t, filepath.Join(modelDir, name), 1024) {
			t.Fatalf("expected downloaded model file %s", name)
		}
	}
	if !documentreading.NativeDocModelsAvailable() {
		t.Fatal("expected required nativedoc models to be available after download")
	}
}

func TestHandleDocumentReaderNativeStatusListsThePacks(t *testing.T) {
	t.Setenv(documentreading.EnvNativeDocModelsDir, t.TempDir())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/document-reader/native/status", nil)
	rec := httptest.NewRecorder()

	(&App{}).handleDocumentReaderNativeStatus(rec, req)

	var resp struct {
		ActivePack string                  `json:"active_pack"`
		Packs      []nativeDocPackResponse `json:"packs"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.ActivePack != documentreading.NativeDocPackDefault {
		t.Fatalf("a fresh directory has the default pack active, got %q", resp.ActivePack)
	}
	ids := map[string]nativeDocPackResponse{}
	for _, pack := range resp.Packs {
		ids[pack.ID] = pack
	}
	latin, ok := ids[documentreading.NativeDocPackLatin]
	if !ok || latin.Installed || latin.Active || len(latin.Languages) == 0 {
		t.Fatalf("expected an uninstalled, inactive Latin pack with its languages, got %+v", resp.Packs)
	}
	if def := ids[documentreading.NativeDocPackDefault]; !def.Active || def.Installed {
		t.Fatalf("the default pack is active but nothing is downloaded yet, got %+v", def)
	}
}

func TestHandleDocumentReaderNativeDownloadRejectsAnUnknownPack(t *testing.T) {
	t.Setenv(documentreading.EnvNativeDocModelsDir, t.TempDir())
	body := strings.NewReader(`{"pack":"klingon"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/document-reader/native/download", body)
	rec := httptest.NewRecorder()

	(&App{}).handleDocumentReaderNativeDownload(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for an unknown pack, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestHandleDocumentReaderNativeDownloadInstallsTheLatinPack(t *testing.T) {
	yml, err := os.ReadFile(filepath.Join("..", "documentreading", "testdata", "latin_rec_inference.yml"))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/inference.yml") {
			w.Write(yml)
			return
		}
		w.Write(bytes.Repeat([]byte("m"), 2048))
	}))
	defer server.Close()
	modelDir := t.TempDir()
	t.Setenv(documentreading.EnvNativeDocModelsDir, modelDir)
	t.Setenv(documentreading.EnvNativeDocModelsBaseURL, server.URL)
	t.Setenv(documentreading.EnvNativeDocLatinBaseURL, server.URL)

	app := &App{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/document-reader/native/download", strings.NewReader(`{"pack":"latin"}`))
	rec := httptest.NewRecorder()
	app.handleDocumentReaderNativeDownload(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 starting download, got %d: %s", rec.Code, rec.Body.String())
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		state := app.nativeDocDownloadState()
		if state.Status == "completed" {
			if state.Pack != documentreading.NativeDocPackLatin || state.FilesCompleted != state.FileCount {
				t.Fatalf("unexpected final state: %+v", state)
			}
			break
		}
		if state.Status == "failed" {
			t.Fatalf("download failed: %+v", state)
		}
		if time.Now().After(deadline) {
			t.Fatalf("download did not complete, last state: %+v", state)
		}
		time.Sleep(10 * time.Millisecond)
	}
	if documentreading.NativeDocActivePack() != documentreading.NativeDocPackLatin || !documentreading.NativeDocModelsAvailable() {
		t.Fatal("the Latin pack must be active and the models available")
	}
	if !fileLargerThan(t, filepath.Join(modelDir, "rec.onnx"), 1024) || !fileLargerThan(t, filepath.Join(modelDir, "ocr.res"), 1024) {
		t.Fatal("the Latin recognizer and its character file must be in the model directory")
	}
}

func fileLargerThan(t *testing.T, path string, size int64) bool {
	t.Helper()
	info, err := os.Stat(path)
	return err == nil && info.Size() > size
}

func strconvQuote(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}
