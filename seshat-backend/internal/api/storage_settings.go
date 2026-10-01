package api

import (
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

type storageConfigResponse struct {
	Provider       string `json:"provider"`
	LocalPath      string `json:"local_path,omitempty"`
	S3Endpoint     string `json:"s3_endpoint,omitempty"`
	S3Bucket       string `json:"s3_bucket,omitempty"`
	S3Region       string `json:"s3_region,omitempty"`
	S3KeyPrefix    string `json:"s3_key_prefix,omitempty"`
	HasS3AccessKey bool   `json:"has_s3_access_key"`
	HasS3SecretKey bool   `json:"has_s3_secret_key"`
	IsConfigured   bool   `json:"is_configured"`
	UpdatedAt      int64  `json:"updated_at,omitempty"`
}

type storageStatusResponse struct {
	ActiveProvider  string                `json:"active_provider"`
	Config          storageConfigResponse `json:"config"`
	RestartRequired bool                  `json:"restart_required"`
}

func storageConfigToResponse(cfg *db.StorageConfig) storageConfigResponse {
	if cfg == nil {
		return storageConfigResponse{Provider: "local", IsConfigured: true}
	}
	var updatedAt int64
	if !cfg.UpdatedAt.IsZero() {
		updatedAt = cfg.UpdatedAt.Unix()
	}
	return storageConfigResponse{
		Provider:       cfg.Provider,
		LocalPath:      cfg.LocalPath,
		S3Endpoint:     cfg.S3Endpoint,
		S3Bucket:       cfg.S3Bucket,
		S3Region:       cfg.S3Region,
		S3KeyPrefix:    cfg.S3KeyPrefix,
		HasS3AccessKey: cfg.HasS3AccessKey,
		HasS3SecretKey: cfg.HasS3SecretKey,
		IsConfigured:   cfg.IsConfigured,
		UpdatedAt:      updatedAt,
	}
}

// GET /api/v1/settings/storage
// PUT /api/v1/settings/storage
func (a *App) handleStorageConfig(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}
	if a.storageConfigStore == nil {
		writeBackendError(w, bkerr.Unavailable("storage config store not available", nil))
		return
	}

	activeProvider := string(storage.GetProviderType())
	if activeProvider == "" {
		activeProvider = "local"
	}

	switch r.Method {
	case http.MethodGet:
		cfg, _ := a.storageConfigStore.Get(r.Context())
		cfgResp := storageConfigToResponse(cfg)
		writeJSON(w, http.StatusOK, storageStatusResponse{
			ActiveProvider:  activeProvider,
			Config:          cfgResp,
			RestartRequired: cfg != nil && cfgResp.Provider != activeProvider,
		})

	case http.MethodPut:
		var body struct {
			Provider    string  `json:"provider"`
			LocalPath   string  `json:"local_path"`
			S3Endpoint  string  `json:"s3_endpoint"`
			S3Bucket    string  `json:"s3_bucket"`
			S3AccessKey *string `json:"s3_access_key"`
			S3SecretKey *string `json:"s3_secret_key"`
			S3Region    string  `json:"s3_region"`
			S3KeyPrefix string  `json:"s3_key_prefix"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		saved, err := a.storageConfigStore.Upsert(r.Context(), db.UpsertStorageConfigParams{
			Provider:    body.Provider,
			LocalPath:   body.LocalPath,
			S3Endpoint:  body.S3Endpoint,
			S3Bucket:    body.S3Bucket,
			S3AccessKey: body.S3AccessKey,
			S3SecretKey: body.S3SecretKey,
			S3Region:    body.S3Region,
			S3KeyPrefix: body.S3KeyPrefix,
		})
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to save storage config: "+err.Error(), err))
			return
		}
		cfgResp := storageConfigToResponse(saved)
		writeJSON(w, http.StatusOK, storageStatusResponse{
			ActiveProvider:  activeProvider,
			Config:          cfgResp,
			RestartRequired: cfgResp.Provider != activeProvider,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
