package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHostGuard(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	guard := HostGuard([]string{"seshat.internal", "10.1.2.3:8090"}, next)

	tests := []struct {
		host string
		want int
	}{
		{"localhost:8090", http.StatusNoContent},
		{"LOCALHOST", http.StatusNoContent},
		{"localhost.:8090", http.StatusNoContent},
		{"127.0.0.1:8090", http.StatusNoContent},
		{"127.0.0.1", http.StatusNoContent},
		{"[::1]:8090", http.StatusNoContent},
		{"seshat.internal:8090", http.StatusNoContent},
		{"10.1.2.3:9000", http.StatusNoContent},
		{"evil.example.com:8090", http.StatusForbidden},
		{"evil.example.com", http.StatusForbidden},
		{"localhost.evil.example.com:8090", http.StatusForbidden},
		{"192.168.1.20:8090", http.StatusForbidden},
		{"0.0.0.0:8090", http.StatusForbidden},
		{"", http.StatusForbidden},
	}
	for _, tt := range tests {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/system/status", nil)
		req.Host = tt.host
		resp := httptest.NewRecorder()
		guard.ServeHTTP(resp, req)
		if resp.Code != tt.want {
			t.Errorf("Host %q: expected %d, got %d", tt.host, tt.want, resp.Code)
		}
	}
}
