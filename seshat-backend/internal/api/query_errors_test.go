package api

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

func TestClassifyStreamError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		msg  string
		want string
	}{
		{"typed unauthorized", bkerr.Unauthorized("no", nil), "no", streamErrAuth},
		{"typed rate limit", bkerr.RateLimit("slow down", nil), "slow down", streamErrRateLimit},
		{"429 in the body", errors.New("x"), `provider error {"raw_status_code":429}`, streamErrRateLimit},
		{"quota before rate limit", errors.New("x"), "insufficient_quota: you exceeded your current quota", streamErrQuota},
		{"context window", errors.New("x"), "request needs 12000 tokens but the hard blocking limit for m is 6000", streamErrContextLength},
		{"tier", errors.New("x"), "tier_not_allowed", streamErrAccess},
		{"bad key", errors.New("x"), "Invalid API key provided", streamErrAuth},
		{"model", errors.New("x"), "model_not_found: gpt-9", streamErrModel},
		{"timeout", errors.New("x"), "context deadline exceeded", streamErrTimeout},
		{"network", errors.New("x"), "dial tcp: no such host", streamErrNetwork},
		{"overloaded", errors.New("x"), "Overloaded", streamErrProvider},
		{"unknown", errors.New("x"), "something odd", streamErrInternal},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifyStreamError(tc.err, tc.msg); got != tc.want {
				t.Errorf("classifyStreamError(%q) = %q, want %q", tc.msg, got, tc.want)
			}
		})
	}
}

func TestWriteSSEErrorCarriesTheKindOnTheWire(t *testing.T) {
	rec := httptest.NewRecorder()
	writeSSEError(rec, rec, nil, "insufficient_quota: out of credit", classifyStreamError(nil, "insufficient_quota: out of credit"))

	body := rec.Body.String()
	if !strings.HasPrefix(body, "event: error\ndata: ") {
		t.Fatalf("not an error event: %q", body)
	}
	var payload map[string]string
	if err := json.Unmarshal([]byte(strings.TrimSuffix(strings.TrimPrefix(body, "event: error\ndata: "), "\n\n")), &payload); err != nil {
		t.Fatalf("payload is not JSON: %v (%q)", err, body)
	}
	if payload["error"] != "insufficient_quota: out of credit" || payload["error_kind"] != streamErrQuota {
		t.Errorf("payload = %v, want the message and kind %q", payload, streamErrQuota)
	}
}
