package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func backendMigrations() []schemaMigration {
	return []schemaMigration{
		{
			ID:    "20260514_001_backend_schema",
			Scope: migrationScopeBackend,
			Run:   migrateBackendSchema,
		},
		{
			ID:    "20260514_002_seed_default_roles",
			Scope: migrationScopeBackend,
			Run:   seedDefaultRoles,
		},
		{
			ID:    "20260515_003_provider_models",
			Scope: migrationScopeBackend,
			Run:   migrateProviderModels,
		},
		{
			ID:    "20260515_004_user_profiles_apikeys_groups",
			Scope: migrationScopeBackend,
			Run:   migrateUserProfilesAPIKeysGroups,
		},
		{
			ID:    "20260515_005_provider_model_source",
			Scope: migrationScopeBackend,
			Run:   migrateProviderModelSource,
		},
		{
			ID:    "20260517_006_session_model_binding",
			Scope: migrationScopeBackend,
			Run:   migrateSessionModelBinding,
		},
		{
			ID:    "20260519_007_search_provider_configs",
			Scope: migrationScopeBackend,
			Run:   migrateSearchProviderConfigs,
		},
		{
			ID:    "20260519_008_embedder_config",
			Scope: migrationScopeBackend,
			Run:   migrateEmbedderConfig,
		},
		{
			ID:    "20260519_009_provider_setting_is_default",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gProviderSetting{})
			},
		},
		{
			ID:    "20260519_010_user_memories",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gUserMemory{})
			},
		},
		{
			ID:    "20260519_011_storage_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gStorageConfig{})
			},
		},
		{
			ID:    "20260519_012_user_preferences",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gUserPreferences{})
			},
		},
		{
			ID:    "20260519_013_mcp_servers",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gMCPServer{})
			},
		},
		{
			ID:    "20260525_014_mcp_server_secret_encryption",
			Scope: migrationScopeBackend,
			Run:   migrateMCPServerSecretEncryption,
		},
		{
			ID:    "20260525_015_session_execution_policy",
			Scope: migrationScopeBackend,
			Run:   migrateSessionExecutionPolicy,
		},
		{
			ID:    "20260526_016_api_key_hashing",
			Scope: migrationScopeBackend,
			Run:   migrateAPIKeyHashing,
		},
		{
			ID:    "20260527_017_plan_documents",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gPlanDocument{})
			},
		},
		{
			ID:    "20260527_018_workspace_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260527_019_project_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260527_020_session_files",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
		{
			ID:    "20260527_021_file_markdown_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
		{
			ID:    "20260531_022_user_preferences_max_sub_agent_depth",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gUserPreferences{})
			},
		},
		{
			ID:    "20260531_024_longterm_memory",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(
					&gMemoryEntity{},
					&gMemoryObservation{},
					&gMemoryRelation{},
				)
			},
		},
		{
			// Rename from_entity_id → from_name and to_entity_id → to_name to align
			// memory_relations with the CoreSQLite DDL used by the SDK session store.
			// SQLite 3.25+ supports ALTER TABLE RENAME COLUMN; errors are ignored so
			// this is idempotent on DBs that already have the correct column names.
			ID:    "20260618_027_memory_relations_rename_columns",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				for _, stmt := range []string{
					`ALTER TABLE memory_relations RENAME COLUMN from_entity_id TO from_name`,
					`ALTER TABLE memory_relations RENAME COLUMN to_entity_id TO to_name`,
				} {
					if err := db.gormDB.WithContext(ctx).Exec(stmt).Error; err != nil {
						// Column already renamed or never existed with the old name — skip.
						if !strings.Contains(err.Error(), "no such column") &&
							!strings.Contains(err.Error(), "no column named") &&
							!strings.Contains(err.Error(), "does not exist") {
							return fmt.Errorf("rename memory_relations column: %w", err)
						}
					}
				}
				return nil
			},
		},
		{
			ID:    "20260605_025_agent_definitions",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gAgentDefinition{})
			},
		},
		{
			ID:    "20260606_026_scheduled_jobs",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gScheduledJob{})
			},
		},
		{
			ID:    "20260618_028_searxng_auth_username",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSearchProviderConfig{})
			},
		},
		{
			// Compound ownership indexes accelerate the two most common query patterns:
			//   1. list sessions for a user ordered by last update   → (user_id, updated_at DESC)
			//   2. title search within a user's sessions             → (user_id, title)
			// Both columns are individually indexed but compound indexes prevent
			// full-scans when both predicates are present simultaneously.
			ID:    "20260531_023_session_ownership_compound_indexes",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				sqls := []string{
					`CREATE INDEX IF NOT EXISTS idx_session_ownership_user_updated
					 ON session_ownership(user_id, updated_at_unix DESC)`,
					`CREATE INDEX IF NOT EXISTS idx_session_ownership_user_title
					 ON session_ownership(user_id, title)`,
				}
				for _, sql := range sqls {
					if err := db.gormDB.WithContext(ctx).Exec(sql).Error; err != nil {
						return fmt.Errorf("migration 022: %w", err)
					}
				}
				return nil
			},
		},
		{
			ID:    "20260629_029_automation_activations",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gAutomationActivation{})
			},
		},
		{
			ID:    "20260712_030_remote_principal_cache",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gRemotePrincipalCache{})
			},
		},
		{
			ID:    "20260713_031_mcp_org_server_approvals",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gMCPOrgServerApproval{})
			},
		},
		{
			ID:    "20260714_032_document_reader_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gDocumentReaderConfig{})
			},
		},
		{
			ID:    "20260722_033_forced_execution_mode",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260722_034_local_stt_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gLocalSTTConfig{})
			},
		},
		{
			ID:    "20260730_035_file_user_message_index",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
		{
			ID:    "20260731_036_file_pdf_preview_path",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gFile{})
			},
		},
		{
			ID:    "20260808_038_session_source",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
			},
		},
		{
			ID:    "20260810_040_capability_credential_links",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gCapabilityLink{})
			},
		},
		{
			ID:    "20260814_041_backfill_rag_scope_id",
			Scope: migrationScopeBackend,
			Run:   backfillRAGScopeID,
		},
		{
			ID:    "20260814_042_connector_accounts",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gConnectorAccount{})
			},
		},
		{
			ID:    "20260830_043_hook_org_approvals",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gHookOrgApproval{})
			},
		},
		{
			// Adds source to an existing agent_definitions table - the
			// default ('user') applies to every row already there, so
			// existing Companion-created agents are unaffected. Lets an
			// Automation graph's own "agent" node create an agent tagged
			// source="workflow" that Companion's own list excludes (see
			// agents.Service.List), instead of every DB-backed agent being
			// indistinguishable from a Companion persona.
			ID:    "20260910_046_agent_definition_source",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gAgentDefinition{})
			},
		},
		{
			ID:    "20260911_047_reranker_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gRerankerConfig{})
			},
		},
		{
			ID:    "20260923_048_sandbox_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gSandboxConfig{})
			},
		},
		{
			ID:    "20261002_049_local_title_config",
			Scope: migrationScopeBackend,
			Run: func(ctx context.Context, db *DB) error {
				return db.gormDB.WithContext(ctx).AutoMigrate(&gLocalTitleConfig{})
			},
		},
	}
}

// backfillRAGScopeID re-queues every already-ingested corpus file so its
// chunks get re-embedded with the scope_id metadata tag the RAG permission
// filter added (Phase 1 of helps/roadmap.md — the tag didn't exist before
// this migration, so without this every existing chunk would silently drop
// out of search results). Reuses the existing ingestion job queue/worker
// instead of touching vector storage directly: ingestFile's re-ingest is
// already idempotent (deterministic per-file artifact key), so simply
// re-running it is enough. Runs once, tracked by the migration framework
// itself — no separate marker needed.
func backfillRAGScopeID(ctx context.Context, db *DB) error {
	var files []gCorpusFile
	if err := db.gormDB.WithContext(ctx).
		Where("status = ?", CorpusFileStatusIngested).
		Find(&files).Error; err != nil {
		return fmt.Errorf("list ingested corpus files: %w", err)
	}
	if len(files) == 0 {
		return nil
	}

	jobs, err := NewKnowledgeIngestionJobStore(db)
	if err != nil {
		return fmt.Errorf("ingestion job store: %w", err)
	}

	corpusCache := make(map[string]gCorpus)
	for _, f := range files {
		corpus, ok := corpusCache[f.CorpusID]
		if !ok {
			if err := db.gormDB.WithContext(ctx).Where("id = ?", f.CorpusID).First(&corpus).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					continue // corpus deleted since this file was ingested
				}
				return fmt.Errorf("load corpus %s: %w", f.CorpusID, err)
			}
			corpusCache[f.CorpusID] = corpus
		}

		if active, err := jobs.FindActiveByCorpusFile(ctx, f.CorpusID, f.FileID); err != nil {
			return fmt.Errorf("find active ingestion job: %w", err)
		} else if active != nil {
			continue
		}

		workspaceID := ""
		if corpus.WorkspaceID != nil {
			workspaceID = *corpus.WorkspaceID
		}
		if _, err := jobs.Create(ctx, CreateKnowledgeIngestionJobParams{
			CorpusID:    f.CorpusID,
			FileID:      f.FileID,
			UserID:      corpus.UserID,
			WorkspaceID: workspaceID,
			Filename:    f.Filename,
		}); err != nil {
			return fmt.Errorf("enqueue backfill job for %s/%s: %w", f.CorpusID, f.FileID, err)
		}
	}
	return nil
}

func migrateProviderModels(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gProviderModel{})
}

func migrateProviderModelSource(ctx context.Context, db *DB) error {
	// Adds the source column ("catalog"/"user") to provider_models
	return db.gormDB.WithContext(ctx).AutoMigrate(&gProviderModel{})
}

func migrateSessionModelBinding(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{})
}

func migrateSearchProviderConfigs(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gSearchProviderConfig{})
}

func migrateEmbedderConfig(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gEmbedderConfig{})
}

func migrateUserProfilesAPIKeysGroups(ctx context.Context, db *DB) error {
	// Local user_groups/group_members tables used to be AutoMigrated here too;
	// the local Group/GroupPermissions system was removed in favor of
	// seshat-server's organization-wide Teams (iam.Group). Existing installs
	// keep those two tables as harmless dead schema - this migration's ID is
	// already recorded as applied for them, so removing the structs here only
	// affects fresh installs, which never create the tables at all.
	return db.gormDB.WithContext(ctx).AutoMigrate(
		&gUser{},   // add new profile columns (username, bio, avatar_url, last_active_at_unix, settings_json)
		&gAPIKey{}, // new table
	)
}

func migrateBackendSchema(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(
		&gUser{},
		&gRole{},
		&gUserRole{},
		&gOrganization{},
		&gWorkspace{},
		&gWorkspaceMembership{},
		&gAuthSession{},
		&gSessionOwnership{},
		&gFile{},
		&gCredential{},
		&gCorpus{},
		&gCorpusFile{},
		&gKnowledgeIngestionJob{},
		&gProviderSetting{},
		&gProviderOAuthConnection{},
		&gWebSearchSetting{},
		&gWebSearchLog{},
		&gAuditLog{},
	)
}

func seedDefaultRoles(ctx context.Context, db *DB) error {
	now := time.Now().Unix()
	defaultRoles := []gRole{
		{ID: "role_admin", Name: "admin", Description: "Full administrative access", IsSystem: 1, CreatedAtUnix: now, UpdatedAtUnix: now, MetadataJSON: "{}"},
		{ID: "role_member", Name: "member", Description: "Default authenticated user role", IsSystem: 1, CreatedAtUnix: now, UpdatedAtUnix: now, MetadataJSON: "{}"},
		{ID: "role_viewer", Name: "viewer", Description: "Read-only access role", IsSystem: 1, CreatedAtUnix: now, UpdatedAtUnix: now, MetadataJSON: "{}"},
	}
	return db.gormDB.WithContext(ctx).
		Clauses(clause.OnConflict{DoNothing: true}).
		Create(&defaultRoles).Error
}

func migrateSessionExecutionPolicy(ctx context.Context, db *DB) error {
	return db.gormDB.WithContext(ctx).AutoMigrate(&gSessionOwnership{}, &gUserPreferences{})
}

func migrateAPIKeyHashing(ctx context.Context, db *DB) error {
	if err := db.gormDB.WithContext(ctx).AutoMigrate(&gAPIKey{}); err != nil {
		return fmt.Errorf("auto-migrate api keys: %w", err)
	}

	var rows []gAPIKey
	if err := db.gormDB.WithContext(ctx).Find(&rows).Error; err != nil {
		return fmt.Errorf("load api keys for hashing migration: %w", err)
	}

	for _, row := range rows {
		updates := map[string]any{}
		if !strings.HasPrefix(row.KeyHash, apiKeyHashPrefix) {
			updates["key"] = hashAPIKey(row.KeyHash)
			if row.KeySuffix == "" {
				updates["key_suffix"] = apiKeySuffix(row.KeyHash)
			}
		} else if row.KeySuffix == "" && strings.HasPrefix(row.KeyHash, "sk-") {
			updates["key_suffix"] = apiKeySuffix(row.KeyHash)
		}
		if len(updates) == 0 {
			continue
		}
		if err := db.gormDB.WithContext(ctx).
			Model(&gAPIKey{}).
			Where("id = ?", row.ID).
			Updates(updates).Error; err != nil {
			return fmt.Errorf("migrate api key %s: %w", row.ID, err)
		}
	}
	return nil
}
