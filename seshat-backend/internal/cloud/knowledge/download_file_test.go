package cloudknowledge

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientDownloadFileParsesContentTypeAndFilename(t *testing.T) {
	var gotAuth, gotPath string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", `attachment; filename="book_fr.pdf"`)
		_, _ = w.Write([]byte("%PDF-1.4 fake bytes"))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	data, meta, err := client.DownloadFile(context.Background(), "user-token", "file_abc123")
	if err != nil {
		t.Fatalf("download file: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected bearer auth, got %q", gotAuth)
	}
	if gotPath != "/api/v1/knowledge/files/file_abc123/content" {
		t.Fatalf("unexpected request path: %q", gotPath)
	}
	if !bytes.Equal(data, []byte("%PDF-1.4 fake bytes")) {
		t.Fatalf("unexpected body: %q", data)
	}
	if meta.ContentType != "application/pdf" {
		t.Fatalf("expected content type application/pdf, got %q", meta.ContentType)
	}
	if meta.Filename != "book_fr.pdf" {
		t.Fatalf("expected filename parsed from Content-Disposition, got %q", meta.Filename)
	}
}

func TestClientDownloadFilePropagatesNotFound(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"message":"file not found"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, _, err := client.DownloadFile(context.Background(), "tok", "file_missing"); err == nil {
		t.Fatal("expected a 404 to propagate as an error")
	}
}
