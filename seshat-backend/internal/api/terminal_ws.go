package api

import (
	"encoding/json"
	"net/http"
	"strings"

	backendquery "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/query"
	"github.com/gorilla/websocket"
)

// terminalUpgrader upgrades /terminal/ws/{sessionID} connections. Only
// Electron's main process (not a browser page) ever connects here,
// authenticated via the same Bearer-token scheme as every other endpoint —
// Origin carries no trust signal for this client, so it isn't checked.
var terminalUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// handleTerminalWS handles GET /api/v1/terminal/ws/{sessionID}. Electron
// opens one of these per open conversation and keeps it alive for as long as
// that conversation's terminal is attached; the engine's RemoteExecutor
// relays bash-tool commands down it (via TerminalRelay.Run) so they execute
// inside the user's real, visible PTY instead of a detached subprocess.
func (app *App) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return
	}

	sessionID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/terminal/ws/"), "/")
	if sessionID == "" {
		writeJSONError(w, http.StatusBadRequest, "session id required")
		return
	}

	// Confirms the session exists and belongs to this principal before
	// upgrading — same ownership check every other /sessions/{id} route uses.
	if _, err := app.backend.Query.GetSession(r.Context(), principal, sessionID); err != nil {
		writeBackendError(w, err)
		return
	}

	conn, err := terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		logError(r, "terminal ws upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	rc := app.terminalRelay.Register(sessionID, conn)
	defer app.terminalRelay.Unregister(sessionID, rc)

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var res backendquery.TerminalResult
		if err := json.Unmarshal(data, &res); err != nil {
			continue
		}
		app.terminalRelay.Resolve(sessionID, res)
	}
}
