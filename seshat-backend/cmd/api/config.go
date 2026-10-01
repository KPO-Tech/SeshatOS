package main

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/api"
	appconfig "github.com/KPO-Tech/seshat/pkg/config"
)

// defaultAPIConfig builds the HTTP server configuration from the app config.
func defaultAPIConfig(config appconfig.Config) api.APIConfig {
	cfg := api.APIConfig{
		Port:        preferredPort(),
		ReadTimeout: 15 * time.Second,
		// WriteTimeout is disabled: SSE responses can stay open for minutes and
		// net/http enforces WriteTimeout across the full response lifetime.
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
		EnableCORS:   false,
	}
	if config.Debug {
		cfg.EnableCORS = true
	}
	return cfg
}

// preferredPort is the port main.go tries first — a fixed default unless
// overridden, since main.go itself falls back to an OS-assigned free port
// when this one is already taken (see startListener).
const defaultPort = 8090

func preferredPort() int {
	raw := strings.TrimSpace(os.Getenv("SESHAT_API_PORT"))
	if raw == "" {
		return defaultPort
	}
	port, err := strconv.Atoi(raw)
	if err != nil || port <= 0 || port > 65535 {
		return defaultPort
	}
	return port
}
