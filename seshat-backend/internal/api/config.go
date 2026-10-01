package api

import "time"

// APIConfig holds HTTP server configuration for the API process.
type APIConfig struct {
	Port           int
	ReadTimeout    time.Duration
	WriteTimeout   time.Duration
	IdleTimeout    time.Duration
	EnableCORS     bool
	AllowedOrigins []string // explicit origin allowlist; if empty and EnableCORS true, defaults to localhost only
}

// defaultAPIConfig is the baseline HTTP server configuration used by tests and
// as the starting point for the cmd/api entrypoint.
var defaultAPIConfig = APIConfig{
	Port:        8090,
	ReadTimeout: 15 * time.Second,
	// WriteTimeout is disabled: SSE responses can stay open for minutes and
	// net/http enforces WriteTimeout across the full response lifetime.
	WriteTimeout: 0,
	IdleTimeout:  60 * time.Second,
	EnableCORS:   false,
}
