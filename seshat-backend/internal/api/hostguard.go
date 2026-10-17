package api

import (
	"net"
	"net/http"
	"strings"
)

// HostGuard rejects every request whose Host header is not a loopback name or one of extraHosts.
//
// The backend answers on a fixed, well-known port and hands out a session without a secret to a
// loopback caller (/auth/local-session). A web page can still reach it from the user's own browser:
// with DNS rebinding the page's domain is re-resolved to 127.0.0.1, the browser treats the backend as
// same-origin, the request really does come from loopback, and the page may read the answer. What the
// page cannot change is the Host header, which stays the attacker's domain: refusing it closes that
// route for every endpoint at once, the websocket of the terminal included.
//
// extraHosts are host names or addresses (port ignored) that are also accepted, for the rare setup
// where the backend is deliberately reached under another name (SESHAT_API_ALLOWED_HOSTS).
func HostGuard(extraHosts []string, next http.Handler) http.Handler {
	allowed := map[string]bool{"localhost": true}
	for _, host := range extraHosts {
		if host = normalizeHost(host); host != "" {
			allowed[host] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostAllowed(r.Host, allowed) {
			writeJSONError(w, http.StatusForbidden, "this host name is not allowed to reach the local backend")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func hostAllowed(hostport string, allowed map[string]bool) bool {
	host := normalizeHost(hostport)
	if host == "" {
		return false
	}
	if allowed[host] {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// normalizeHost returns the lower-case host of "host", "host:port" or "[v6]:port", without brackets and
// without the trailing dot of a fully qualified name.
func normalizeHost(hostport string) string {
	hostport = strings.TrimSpace(hostport)
	if hostport == "" {
		return ""
	}
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	return strings.ToLower(strings.TrimSuffix(host, "."))
}

// ParseAllowedHosts splits a comma-separated list of host names.
func ParseAllowedHosts(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
