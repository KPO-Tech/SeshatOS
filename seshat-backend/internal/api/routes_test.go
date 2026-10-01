package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRecoverMiddlewarePanicBeforeResponse verifies the ordinary case: a panic
// before anything was written to the client still produces a normal JSON 500
// error body, unaffected by the commitTrackingWriter wrapper.
func TestRecoverMiddlewarePanicBeforeResponse(t *testing.T) {
	handler := recoverMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom before any write")
	}))

	req := httptest.NewRequest(http.MethodGet, "/whatever", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected status 500, got %d", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("expected valid JSON error body, got %q: %v", rec.Body.String(), err)
	}
	if _, ok := body["error"]; !ok {
		t.Fatalf("expected an \"error\" field in the JSON body, got %v", body)
	}
}

// TestRecoverMiddlewarePanicMidStream verifies the SSE case this middleware
// was specifically extended for: a panic after the handler already committed
// a 200 and started streaming (as handleQueryStream does before the engine
// even starts running) must NOT produce a bare JSON blob spliced into the
// half-open response — the client (an EventSource / SSE reader) would have no
// way to tell that apart from a truncated or corrupted connection. It must
// instead see a protocol-conformant `event: error` SSE frame, matching the
// contract documented in query_sse.go.
func TestRecoverMiddlewarePanicMidStream(t *testing.T) {
	handler := recoverMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		_, _ = w.Write([]byte("data: {\"hello\":\"world\"}\n\n"))
		panic("boom mid-stream")
	}))

	req := httptest.NewRequest(http.MethodGet, "/query/stream", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	// The status line was already committed as 200 before the panic — the
	// middleware must not (and per net/http, cannot) change it.
	if rec.Code != http.StatusOK {
		t.Fatalf("expected the already-committed 200 status to stand, got %d", rec.Code)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "data: {\"hello\":\"world\"}") {
		t.Fatalf("expected the pre-panic SSE data already written to be preserved, got %q", body)
	}
	if !strings.Contains(body, "event: error") {
		t.Fatalf("expected a protocol-conformant \"event: error\" SSE frame after the panic, got %q", body)
	}
	// A bare, non-SSE-framed JSON error object (no "event: error\ndata: "
	// prefix) is exactly the bug this test guards against — the client can't
	// distinguish it from a corrupted stream.
	if idx := strings.Index(body, "{\"error\""); idx >= 0 {
		prefix := body[:idx]
		if !strings.HasSuffix(strings.TrimRight(prefix, "\n"), "data: ") {
			t.Fatalf("error payload was not SSE-framed with a preceding \"data: \" line: %q", body)
		}
	} else {
		t.Fatalf("expected an error payload in the response body, got %q", body)
	}
}

// TestCommitTrackingWriterTracksCommit verifies the tracking wrapper itself:
// committed flips on WriteHeader or Write, never on Header() alone, and
// Flush() still reaches the underlying ResponseWriter (streaming handlers
// type-assert http.Flusher on whatever ResponseWriter they were given, so
// silently breaking that would break SSE for every handler, not just panics).
func TestCommitTrackingWriterTracksCommit(t *testing.T) {
	t.Run("Header alone does not commit", func(t *testing.T) {
		rec := httptest.NewRecorder()
		cw := &commitTrackingWriter{ResponseWriter: rec}
		cw.Header().Set("X-Test", "1")
		if cw.committed {
			t.Fatal("expected committed to stay false after Header() alone")
		}
	})

	t.Run("WriteHeader commits", func(t *testing.T) {
		rec := httptest.NewRecorder()
		cw := &commitTrackingWriter{ResponseWriter: rec}
		cw.WriteHeader(http.StatusOK)
		if !cw.committed {
			t.Fatal("expected committed to be true after WriteHeader")
		}
	})

	t.Run("Write commits", func(t *testing.T) {
		rec := httptest.NewRecorder()
		cw := &commitTrackingWriter{ResponseWriter: rec}
		if _, err := cw.Write([]byte("x")); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !cw.committed {
			t.Fatal("expected committed to be true after Write")
		}
	})

	t.Run("Flush reaches the underlying writer", func(t *testing.T) {
		rec := httptest.NewRecorder()
		cw := &commitTrackingWriter{ResponseWriter: rec}
		cw.Flush()
		if !rec.Flushed {
			t.Fatal("expected Flush() to be forwarded to the underlying httptest.ResponseRecorder")
		}
	})
}
