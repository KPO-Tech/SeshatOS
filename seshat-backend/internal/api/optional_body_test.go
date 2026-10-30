package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeOptionalJSONBody(t *testing.T) {
	type payload struct {
		BaseURL string `json:"base_url"`
	}
	cases := []struct {
		name    string
		body    string
		ok      bool
		status  int
		baseURL string
	}{
		{"a body that is left out keeps the zero value", "", true, http.StatusOK, ""},
		{"a valid body is read", `{"base_url":"http://x"}`, true, http.StatusOK, "http://x"},
		{"a body that is not JSON is refused", `{"base_url":`, false, http.StatusBadRequest, ""},
		{"a body of the wrong shape is refused", `["a"]`, false, http.StatusBadRequest, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(c.body))
			var got payload
			if ok := decodeOptionalJSONBody(w, r, &got); ok != c.ok {
				t.Fatalf("ok = %v, want %v", ok, c.ok)
			}
			if !c.ok && w.Code != c.status {
				t.Fatalf("status = %d, want %d", w.Code, c.status)
			}
			if got.BaseURL != c.baseURL {
				t.Fatalf("base_url = %q, want %q", got.BaseURL, c.baseURL)
			}
		})
	}
}
