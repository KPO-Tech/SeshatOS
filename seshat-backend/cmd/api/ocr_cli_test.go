package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
)

func decodeLines[T any](t *testing.T, out *bytes.Buffer) []T {
	t.Helper()
	var items []T
	for _, line := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if line == "" {
			continue
		}
		var item T
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			t.Fatalf("not a JSON line: %q: %v", line, err)
		}
		items = append(items, item)
	}
	return items
}

func TestRunOCRCommandIgnoresWhatIsNotItsCommand(t *testing.T) {
	for _, args := range [][]string{nil, {"--version"}, {"--something-else"}} {
		var out bytes.Buffer
		if handled, _ := runOCRCommand(context.Background(), args, &out); handled || out.Len() != 0 {
			t.Fatalf("%v must not be handled, handled=%v out=%q", args, handled, out.String())
		}
	}
}

func TestOCRPacksListsThePacksAndWhatToDownload(t *testing.T) {
	t.Setenv(documentreading.EnvNativeDocModelsDir, t.TempDir())
	var out bytes.Buffer
	handled, code := runOCRCommand(context.Background(), []string{"--ocr-packs"}, &out)
	if !handled || code != 0 {
		t.Fatalf("handled=%v code=%d", handled, code)
	}
	reports := decodeLines[ocrPacksReport](t, &out)
	if len(reports) != 1 {
		t.Fatalf("expected one JSON line, got %d", len(reports))
	}
	byID := map[string]ocrPackInfo{}
	for _, pack := range reports[0].Packs {
		byID[pack.ID] = pack
	}
	latin, ok := byID[documentreading.NativeDocPackLatin]
	if !ok || len(latin.Languages) == 0 || latin.Installed || latin.Active {
		t.Fatalf("expected an uninstalled, inactive Latin pack with languages, got %+v", reports[0].Packs)
	}
	// An empty directory: the shared models (about 93 MB) and the recognizer (8 MB).
	if latin.DownloadBytes < 95_000_000 || latin.DownloadBytes > 105_000_000 {
		t.Fatalf("expected about 101 MB to download, got %d", latin.DownloadBytes)
	}
	if !byID[documentreading.NativeDocPackDefault].Active {
		t.Fatal("a fresh directory has the default pack active")
	}
}

func TestOCRPacksCountsOnlyWhatIsMissing(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(documentreading.EnvNativeDocModelsDir, dir)
	for _, name := range []string{"det.ort", "layout.ort", "tsr.ort"} {
		if err := os.WriteFile(filepath.Join(dir, name), bytes.Repeat([]byte("m"), 2048), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	var out bytes.Buffer
	runOCRCommand(context.Background(), []string{"--ocr-packs"}, &out)
	for _, pack := range decodeLines[ocrPacksReport](t, &out)[0].Packs {
		if pack.ID == documentreading.NativeDocPackLatin && pack.DownloadBytes != 8_000_000 {
			t.Fatalf("with the shared models there, only the recognizer is left: got %d", pack.DownloadBytes)
		}
	}
}

func TestDownloadOCRPackReportsProgressThenDone(t *testing.T) {
	yml, err := os.ReadFile(filepath.Join("..", "..", "internal", "documentreading", "testdata", "latin_rec_inference.yml"))
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/inference.yml") {
			_, _ = w.Write(yml)
			return
		}
		_, _ = w.Write(bytes.Repeat([]byte("m"), 4096))
	}))
	defer server.Close()
	dir := t.TempDir()
	t.Setenv(documentreading.EnvNativeDocModelsDir, dir)
	t.Setenv(documentreading.EnvNativeDocModelsBaseURL, server.URL)
	t.Setenv(documentreading.EnvNativeDocLatinBaseURL, server.URL)

	var out bytes.Buffer
	handled, code := runOCRCommand(context.Background(), []string{"--download-ocr-pack", "latin"}, &out)
	if !handled || code != 0 {
		t.Fatalf("handled=%v code=%d out=%s", handled, code, out.String())
	}
	events := decodeLines[ocrDownloadEvent](t, &out)
	if len(events) < 2 || events[len(events)-1].Event != "done" {
		t.Fatalf("expected progress lines then done, got %+v", events)
	}
	files := map[string]bool{}
	for _, event := range events[:len(events)-1] {
		if event.Event != "progress" || event.FileCount != 5 {
			t.Fatalf("unexpected event %+v", event)
		}
		files[event.File] = true
	}
	for _, name := range []string{"det.ort", "layout.ort", "tsr.ort", "rec.onnx", "ocr.res"} {
		if !files[name] {
			t.Errorf("no progress line for %s", name)
		}
	}
	if !documentreading.NativeDocModelsAvailable() || documentreading.NativeDocActivePack() != documentreading.NativeDocPackLatin {
		t.Fatal("the Latin pack must be downloaded and active")
	}
}

func TestDownloadOCRPackErrors(t *testing.T) {
	t.Setenv(documentreading.EnvNativeDocModelsDir, t.TempDir())
	var out bytes.Buffer
	if _, code := runOCRCommand(context.Background(), []string{"--download-ocr-pack", "klingon"}, &out); code == 0 {
		t.Fatal("an unknown pack must fail")
	}
	if events := decodeLines[ocrDownloadEvent](t, &out); len(events) != 1 || events[0].Event != "error" || !strings.Contains(events[0].Message, "klingon") {
		t.Fatalf("expected one error event naming the pack, got %+v", events)
	}
	out.Reset()
	if _, code := runOCRCommand(context.Background(), []string{"--download-ocr-pack"}, &out); code == 0 {
		t.Fatal("a missing pack id must fail")
	}

	// A server that answers 500: the download fails and says so, with a non-zero exit code.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "boom", http.StatusInternalServerError) }))
	defer server.Close()
	t.Setenv(documentreading.EnvNativeDocModelsBaseURL, server.URL)
	out.Reset()
	if _, code := runOCRCommand(context.Background(), []string{"--download-ocr-pack", "latin"}, &out); code != 1 {
		t.Fatalf("a failed download must exit 1, got %d", code)
	}
	events := decodeLines[ocrDownloadEvent](t, &out)
	if last := events[len(events)-1]; last.Event != "error" || !strings.Contains(last.Message, "500") {
		t.Fatalf("expected an error event with the HTTP status, got %+v", events)
	}
}
