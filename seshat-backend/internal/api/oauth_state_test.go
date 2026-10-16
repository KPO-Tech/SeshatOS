package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The callback page is the one place a query string reaches HTML, and the
// callback is deliberately unauthenticated (a provider redirect carries no
// bearer token), so anyone can put a payload in `?error=` and hand the user
// the link. These tests pin the escaping at the sink.

func TestWriteOAuthResultPageEscapesMessage(t *testing.T) {
	cases := []struct {
		name    string
		message string
		raw     string
		escaped string
	}{
		{
			name:    "script tag",
			message: "Google reported an error: <script>alert(1)</script>",
			raw:     "<script>",
			escaped: "&lt;script&gt;alert(1)&lt;/script&gt;",
		},
		{
			name:    "attribute break",
			message: `Google reported an error: " onload="alert(1)`,
			raw:     `onload="alert(1)`,
			escaped: "&#34; onload=&#34;alert(1)",
		},
		{
			name:    "image onerror",
			message: "<img src=x onerror=alert(1)>",
			raw:     "<img src=x",
			escaped: "&lt;img src=x onerror=alert(1)&gt;",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeOAuthResultPage(rec, false, tc.message)
			body := rec.Body.String()

			if strings.Contains(body, tc.raw) {
				t.Fatalf("expected %q to be escaped, got body: %s", tc.raw, body)
			}
			if !strings.Contains(body, tc.escaped) {
				t.Fatalf("expected %q in body, got: %s", tc.escaped, body)
			}
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for a failed result page, got %d", rec.Code)
			}
		})
	}
}

func TestWriteOAuthResultPageKeepsPlainMessage(t *testing.T) {
	rec := httptest.NewRecorder()
	writeOAuthResultPage(rec, true, "Google Drive is connected. You can close this window.")
	body := rec.Body.String()

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for a successful result page, got %d", rec.Code)
	}
	if !strings.Contains(body, "Google Drive is connected.") {
		t.Fatalf("expected the message to be shown, got: %s", body)
	}
}

func TestWriteOAuthResultPageBoundsMessageLength(t *testing.T) {
	rec := httptest.NewRecorder()
	writeOAuthResultPage(rec, false, strings.Repeat("A", 5000))
	body := rec.Body.String()

	if len(body) > 2000 {
		t.Fatalf("expected the page to stay bounded, got %d bytes", len(body))
	}
	if !strings.Contains(body, "…") {
		t.Fatalf("expected a truncation marker, got: %s", body)
	}
}

// The two redirect callbacks share writeOAuthResultPage; each must pass the
// provider's error through it rather than writing the query itself. Calling
// the handler directly is enough: this branch returns before touching any
// app state.
func TestOAuthCallbacksEscapeProviderError(t *testing.T) {
	payload := `<script>alert(1)</script>`
	handlers := map[string]func(*App, http.ResponseWriter, *http.Request){
		"gdrive":     (*App).handleKnowledgeGDriveOAuthCallback,
		"sharepoint": (*App).handleKnowledgeSharePointOAuthCallback,
	}

	for name, handler := range handlers {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/oauth/callback?error="+payload, nil)
			rec := httptest.NewRecorder()
			handler(&App{}, rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Fatalf("expected 400 for a provider error, got %d: %s", rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "<script>") {
				t.Fatalf("expected the provider error to be escaped, got: %s", rec.Body.String())
			}
		})
	}
}

func TestTruncateRunesKeepsRuneBoundaries(t *testing.T) {
	// 5 runes of 2 bytes each: cutting by bytes would leave a broken char.
	got := truncateRunes("ééééé", 3)
	if got != "ééé…" {
		t.Fatalf("expected a rune-boundary cut, got %q", got)
	}
	if truncateRunes("short", 10) != "short" {
		t.Fatalf("expected a short string to be returned unchanged")
	}
}
