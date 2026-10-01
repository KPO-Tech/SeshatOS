package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/seshat/pkg/runtimepath"
)

const desktopBridgeSecretFile = "desktop-bridge-secret"

func desktopBridgeSecretPath() string {
	return filepath.Join(runtimepath.DataDir(""), desktopBridgeSecretFile)
}

func ensureDesktopBridgeSecret() ([]byte, error) {
	path := desktopBridgeSecretPath()
	if secret, err := readDesktopBridgeSecret(path); err == nil {
		return secret, nil
	} else if !os.IsNotExist(err) {
		return nil, err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create desktop bridge secret dir: %w", err)
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("generate desktop bridge secret: %w", err)
	}
	encoded := hex.EncodeToString(raw)
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if os.IsExist(err) {
			return readDesktopBridgeSecret(path)
		}
		return nil, fmt.Errorf("create desktop bridge secret: %w", err)
	}
	defer f.Close()
	if _, err := f.WriteString(encoded); err != nil {
		return nil, fmt.Errorf("write desktop bridge secret: %w", err)
	}
	return raw, nil
}

func readDesktopBridgeSecret(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	secret, err := hex.DecodeString(strings.TrimSpace(string(data)))
	if err != nil {
		return nil, fmt.Errorf("decode desktop bridge secret: %w", err)
	}
	if len(secret) < 32 {
		return nil, fmt.Errorf("desktop bridge secret too short")
	}
	return secret, nil
}

func desktopBridgeProof(secret []byte, nonce string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(nonce))
	return hex.EncodeToString(mac.Sum(nil))
}

func (app *App) handleDesktopHandshake(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	nonce := strings.TrimSpace(r.URL.Query().Get("nonce"))
	if nonce == "" || len(nonce) > 512 {
		writeBackendError(w, bkerr.InvalidInput("nonce is required", nil))
		return
	}
	secret, err := ensureDesktopBridgeSecret()
	if err != nil {
		logError(r, "desktop handshake secret unavailable: %v", err)
		writeBackendError(w, bkerr.Unavailable("desktop handshake unavailable", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"algorithm": "hmac-sha256",
		"proof":     desktopBridgeProof(secret, nonce),
	})
}
