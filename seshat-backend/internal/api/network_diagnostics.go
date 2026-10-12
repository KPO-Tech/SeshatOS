package api

import (
	"net/http"

	"github.com/KPO-Tech/seshat/pkg/netdiag"
)

// handleNetworkDiagnostics runs a live connectivity probe against this
// build's seshat-server target (see App.targetServerURL) and reports it back
// as a named sequence of steps - the desktop-side half of
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 6. Authenticated
// (unlike /system/status, which must be reachable before login) since this
// triggers real outbound network activity on demand, not just a config read.
func (a *App) handleNetworkDiagnostics(w http.ResponseWriter, r *http.Request) {
	if a.targetServerURL == "" {
		writeJSON(w, http.StatusOK, netdiag.Result{Name: "Seshat Server", OK: true, Steps: nil})
		return
	}
	result := netdiag.ProbeHTTP(r.Context(), "Seshat Server", a.targetServerURL, "/health")
	writeJSON(w, http.StatusOK, result)
}
