package api

import (
	"fmt"
	"net/http"
)

// handleMetrics serves runtime metrics in Prometheus text format (or JSON via ?format=json).
// Mounted at GET /metrics — intended as a Prometheus scrape target.
func (app *App) handleMetrics(w http.ResponseWriter, r *http.Request) {
	app.serveMetrics(w, r, "prometheus")
}

// handleMetricsJSON serves runtime metrics as JSON.
// Mounted at GET /api/v1/metrics.
func (app *App) handleMetricsJSON(w http.ResponseWriter, r *http.Request) {
	app.serveMetrics(w, r, "json")
}

func (app *App) serveMetrics(w http.ResponseWriter, r *http.Request, defaultFormat string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = defaultFormat
	}

	snapshot, err := app.backend.Metrics.Snapshot(r.Context(), format)
	if err != nil {
		writeBackendError(w, err)
		return
	}

	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json")
	case "prometheus":
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	default:
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	}
	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, snapshot)
}
