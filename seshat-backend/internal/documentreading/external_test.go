package documentreading

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/documentreader"
)

// The size a host chunks with reaches the service: without it the service cuts at its tokenizer's own limit.
func TestSeshatIntelligenceClientSendsTheChunkSize(t *testing.T) {
	t.Parallel()

	var fields map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("ParseMultipartForm: %v", err)
		}
		fields = map[string]string{}
		for name, values := range r.MultipartForm.Value {
			fields[name] = values[0]
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"filename":"report.pdf","chunks":[{"index":0,"text":"a chunk"}]}`))
	}))
	defer server.Close()

	client, err := NewSeshatIntelligenceClient(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	chunker := client.(documentreader.HybridChunker)

	if _, err := chunker.ChunkHybridBytes(context.Background(), []byte("data"), "report.pdf", documentreader.ChunkOptions{MaxTokens: 512}); err != nil {
		t.Fatal(err)
	}
	if fields["max_tokens"] != "512" {
		t.Fatalf("form fields = %v, want max_tokens=512", fields)
	}

	if _, err := chunker.ChunkHybridBytes(context.Background(), []byte("data"), "report.pdf", documentreader.ChunkOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, sent := fields["max_tokens"]; sent {
		t.Fatalf("no size was asked for, none must be sent: %v", fields)
	}
}
