// Package cloudhttp is the shared request/response plumbing for every
// internal/cloud* client (cloudsettings, cloudpreferences, cloudidentity,
// cloudautomation, cloudskillregistry, cloudwebsearch, cloudmcp) — each is a
// thin, stateless HTTP client for one seshat-server domain, and each used to
// hand-roll an identical "build request, set auth header, check status,
// decode JSON" helper. A fix to that shared plumbing (error formatting,
// timeout handling, status-code edge cases) now lives in one place instead
// of 4-7 near-identical copies.
package cloudhttp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
)

// HTTPError carries the response status code so callers can translate it
// into a domain-specific error kind (e.g. 401→Unauthorized, 403→Forbidden)
// via errors.As.
type HTTPError struct {
	Status int
	Body   string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("seshat-server returned %d: %s", e.Status, e.Body)
}

// Do sends a request to url with the given method, optionally JSON-encoding
// body (nil for none) and decoding the JSON response into out (nil to
// discard it). token is set as a Bearer Authorization header when non-empty
// (some callers, e.g. cloudautomation, pass a fixed device token; others
// pass nothing for unauthenticated calls like login).
//
// Returns the response status code alongside the error so callers that need
// to special-case a status (e.g. 204 "nothing to claim" not being an error)
// can do so without a type assertion. A status-code error (>= 400) is
// always an *HTTPError; network/encode/decode failures are plain wrapped
// errors.
func Do(ctx context.Context, client *http.Client, method, url, token string, body, out any) (int, error) {
	var bodyReader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return 0, fmt.Errorf("encode request: %w", err)
		}
		bodyReader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return 0, fmt.Errorf("build request: %w", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("seshat-server unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, &HTTPError{Status: resp.StatusCode, Body: strings.TrimSpace(string(raw))}
	}
	if out != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return resp.StatusCode, fmt.Errorf("decode response: %w", err)
		}
	}
	return resp.StatusCode, nil
}

// Translate maps an *HTTPError's status code to the matching bkerr.Kind, so
// every cloud* Provider reports the same error shape for the same seshat-
// server response (400→InvalidInput, 401→Unauthorized, 403→Forbidden,
// 404→NotFound, everything else→Internal). A non-HTTPError (network
// failure, decode failure, ...) becomes bkerr.Unavailable("seshat-server
// unreachable", err) — the server was never actually reached to have an
// opinion.
func Translate(err error) error {
	var httpErr *HTTPError
	if !errors.As(err, &httpErr) {
		return bkerr.Unavailable("seshat-server unreachable", err)
	}
	switch httpErr.Status {
	case http.StatusBadRequest:
		return bkerr.InvalidInput(httpErr.Body, err)
	case http.StatusUnauthorized:
		return bkerr.Unauthorized(httpErr.Body, err)
	case http.StatusForbidden:
		return bkerr.Forbidden(httpErr.Body, err)
	case http.StatusNotFound:
		return bkerr.NotFound(httpErr.Body, err)
	default:
		return bkerr.Internal(httpErr.Body, err)
	}
}
