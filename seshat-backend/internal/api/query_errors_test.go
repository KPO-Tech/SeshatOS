package api

import (
	"errors"
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
