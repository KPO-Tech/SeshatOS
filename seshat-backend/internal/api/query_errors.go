package api

import (
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// Kinds of a failed turn, as the client receives them in the "error_kind" field of an error event. The client turns each into a
// title, an explanation and a next step, so the set is small and stable; the message stays the raw text for the details.
const (
	streamErrAuth          = "auth"           // the provider refused the key
	streamErrAccess        = "access"         // the key is fine but the plan or region does not allow this model
	streamErrRateLimit     = "rate_limit"     // too many requests
	streamErrQuota         = "quota"          // the account is out of credit
	streamErrContextLength = "context_length" // the conversation does not fit the model
	streamErrModel         = "model"          // the model does not exist or is not served
	streamErrTimeout       = "timeout"        // the provider took too long
	streamErrNetwork       = "network"        // the provider could not be reached
	streamErrProvider      = "provider"       // the provider failed (5xx, overloaded)
	streamErrInvalid       = "invalid_request"
	streamErrInternal      = "internal"
)

// classifyStreamError names the kind of a failed turn. The runtime hands over a typed error code only inside its message, so the
// kind comes from the backend's own error kind when it has one and from the text of the failure otherwise.
func classifyStreamError(err error, message string) string {
	if err != nil {
		switch bkerr.KindOf(err) {
		case bkerr.ErrorKindUnauthorized:
			return streamErrAuth
		case bkerr.ErrorKindForbidden:
			return streamErrAccess
		case bkerr.ErrorKindRateLimit:
			return streamErrRateLimit
		case bkerr.ErrorKindTooLarge:
			return streamErrContextLength
		case bkerr.ErrorKindInvalidInput:
			return streamErrInvalid
		}
	}
	lower := strings.ToLower(message)
	has := func(parts ...string) bool {
		for _, part := range parts {
			if strings.Contains(lower, part) {
				return true
			}
		}
		return false
	}
	switch {
	case has("insufficient_quota", "insufficient credit", "credit balance", "billing", "exceeded your current quota", "payment required", "status_code\":402"):
		return streamErrQuota
	case has("rate_limit", "rate limit", "too many requests", "status_code\":429", "status 429"):
		return streamErrRateLimit
	case has("context_length", "context length", "context window", "maximum context", "prompt is too long", "too many tokens", "compact_full", "blocking limit"):
		return streamErrContextLength
	case has("tier_not_allowed", "not available in your subscription", "permission_denied", "status_code\":403", "status 403", "forbidden"):
		return streamErrAccess
	case has("invalid api key", "invalid_api_key", "incorrect api key", "authentication", "unauthorized", "api_auth", "status_code\":401", "status 401"):
		return streamErrAuth
	case has("model_not_found", "model not found", "does not exist", "unknown model", "no such model"):
		return streamErrModel
	case has("deadline exceeded", "timeout", "timed out", "api_timeout"):
		return streamErrTimeout
	case has("connection refused", "no such host", "failed to send request", "failed to reach", "connection reset", "unexpected eof", "network is unreachable", "tls:"):
		return streamErrNetwork
	case has("overloaded", "status_code\":5", "status 5", "bad gateway", "service unavailable", "internal server error"):
		return streamErrProvider
	case has("invalid_request", "invalid request", "bad request", "status_code\":400", "status 400"):
		return streamErrInvalid
	}
	return streamErrInternal
}
