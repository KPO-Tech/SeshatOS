// Package config assembles the full application from infrastructure config.
// It is the single place that wires DB stores, RAG, MCP, skills, and the
// SDK query runtime into a ready-to-serve *api.App.
package config

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	neturl "net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/api"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/agents"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/hooks"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/identity"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/knowledge"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/longterm"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/mcp"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/memories"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/preferences"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/quotas"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/settings"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/websearch"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/dataflowsecrets"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
	backendknowledge "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/azureblob"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/gdrive"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/onedrive"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/s3"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/sharepoint"
	knowledgeAgentTools "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/tool"
	mcpAction "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/mcp/action"
	backendmemories "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/memories"
	backendpreferences "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/preferences"
	backendquery "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/query"
	backendquotas "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/quotas"
	backendsettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	appconfig "github.com/KPO-Tech/seshat/pkg/config"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/mcp"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/monitoring"
	"github.com/KPO-Tech/seshat/pkg/providers"
	"github.com/KPO-Tech/seshat/pkg/rag"
	ragembedder "github.com/KPO-Tech/seshat/pkg/rag/embedder"
	"github.com/KPO-Tech/seshat/pkg/rag/reranker"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	skillsloader "github.com/KPO-Tech/seshat/pkg/skills"
	managedskills "github.com/KPO-Tech/seshat/pkg/skills/managed"
	"github.com/KPO-Tech/seshat/pkg/skills/skillrepos"
	"github.com/KPO-Tech/seshat/pkg/storage"
	enginetypes "github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/vector"
)

// defaultServerURL is the seshat-server this build talks to when it's
// reachable - a source-level constant, not an environment variable or user
// setting. seshat-server access is Seshat's paid managed-service tier;
// shipping a way to point the app at a different server (env var, Settings
// field) would let anyone retarget it to their own free self-hosted
// instance. TODO: replace with the real production URL once seshat-server
// is actually deployed - localhost:8081 only matches the local Docker
// compose stack under deploy/.
const defaultServerURL = "http://localhost:8081"

func discoverElectronBrowserRemoteControlURL(ctx context.Context) string {
	port := strings.TrimSpace(os.Getenv("SESHAT_ELECTRON_REMOTE_DEBUG_PORT"))
	if port == "" {
		port = "9333"
	}
	if _, err := strconv.Atoi(port); err != nil {
		return ""
	}
	reqCtx, cancel := context.WithTimeout(ctx, 350*time.Millisecond)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, "http://127.0.0.1:"+port+"/json/version", nil)
	if err != nil {
		return ""
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ""
	}
	var payload struct {
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.WebSocketDebuggerURL)
}

// resolveElectronBrowserSessionTarget asks the Electron main process (via its
// small local bridge server - see seshat-desktop/src/main/browser-bridge.ts)
// to create/reuse the desktop-visible browser tab dedicated to sessionID, and
// returns its CDP target ID so the SDK's browser session can attach directly
// to it (see sdk.ClientConfig.BrowserSessionTargetResolver). Returns
// ok=false whenever the bridge isn't configured or reachable - e.g. dev mode,
// or a platform without the desktop shell at all - so callers fall back to
// the SDK's normal incognito-per-session behavior with no special-casing.
func resolveElectronBrowserSessionTarget(ctx context.Context, sessionID sdk.SessionID) (string, bool) {
	// Same shared-default-port convention as discoverElectronBrowserRemoteControlURL
	// above: works out of the box in dev mode (both processes started manually,
	// neither passing env vars to the other) as long as neither side overrode it.
	port := strings.TrimSpace(os.Getenv("SESHAT_ELECTRON_BRIDGE_PORT"))
	if port == "" {
		port = "9334"
	}
	if _, err := strconv.Atoi(port); err != nil {
		return "", false
	}
	reqCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	url := "http://127.0.0.1:" + port + "/session-target?sessionId=" + neturl.QueryEscape(string(sessionID))
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return "", false
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", false
	}
	var payload struct {
		TargetID string `json:"target_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", false
	}
	targetID := strings.TrimSpace(payload.TargetID)
	return targetID, targetID != ""
}

// BuildApp wires all infrastructure (DB, stores, query runtime, RAG, MCP, skills)
// and returns a ready-to-serve *api.App, a cleanup function, and an error.
//
// The returned cleanup function tears down the query client, vector DB (if any),
// and the primary database. It must be called on shutdown.
func BuildApp(ctx context.Context, config appconfig.Config) (*api.App, func() error, error) {
	var cleanups []func() error
	cleanup := func() error {
		for i := len(cleanups) - 1; i >= 0; i-- {
			_ = cleanups[i]()
		}
		return nil
	}

	otelShutdown, err := monitoring.InitTracer(ctx, "seshat")
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement OTel: %v\n", err)
	}
	cleanups = append(cleanups, func() error { return otelShutdown(context.Background()) })

	logProviderDiscovery(ctx)

	storageCfg := storage.Config{
		Provider:          storage.ProviderType(config.StorageProvider),
		LocalPath:         appconfig.EffectiveStorageLocalPath(config),
		S3Endpoint:        config.S3Endpoint,
		S3Bucket:          config.S3Bucket,
		S3AccessKeyID:     config.S3AccessKeyID,
		S3SecretAccessKey: config.S3SecretAccessKey,
		S3Region:          config.S3Region,
		S3KeyPrefix:       config.S3KeyPrefix,
	}
	storage.SetConfig(storageCfg)

	if err := storage.HealthCheck(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement storage: %v\n", err)
	} else {
		fmt.Printf("[API] Storage initialisé: %s\n", storage.GetProviderType())
		fmt.Printf("[API] Runtime root: %s\n", appconfig.EffectiveRuntimeRoot(config))
	}

	workingDir := config.Cwd
	if strings.TrimSpace(workingDir) == "" {
		workingDir = "."
	}

	var dbConfig db.Config
	switch db.Driver(config.DBDriver) {
	case db.DriverPostgres:
		dbConfig = db.DefaultPostgresConfig(config.DBDSN)
	case db.DriverMySQL:
		dbConfig = db.DefaultMySQLConfig(config.DBDSN)
	default:
		dbConfig = db.DefaultSQLiteConfig(appconfig.EffectiveBackendSQLitePath(config))
	}
	dbConfig.AutoMigrate = config.DBAutoMigrate
	database, err := db.Open(ctx, dbConfig)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init DB: %w", err)
	}
	cleanups = append(cleanups, database.Close)

	identityStore, err := db.NewIdentityStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init identity store: %w", err)
	}

	apiKeyStore, err := db.NewAPIKeyStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init api key store: %w", err)
	}

	sessionOwnershipStore, err := db.NewSessionOwnershipStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init session ownership store: %w", err)
	}

	fileStore, err := db.NewFileStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init file store: %w", err)
	}

	corpusStore, err := db.NewCorpusStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init corpus store: %w", err)
	}

	ingestionJobStore, err := db.NewKnowledgeIngestionJobStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init ingestion job store: %w", err)
	}

	// Google Drive Knowledge connector - same env-var-gated, graceful-skip
	// pattern as Gmail above. Read-only, manual sync trigger only in this
	// first version (see helps/roadmap.md Phase 1) - no background loop like
	// Gmail's, since there's no local scheduler to run one on and syncing a
	// whole Drive is a heavier operation than polling a mailbox.
	connectorAccountStore, err := db.NewConnectorAccountStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init connector account store: %w", err)
	}
	var knowledgeGDriveConnector *gdrive.Connector
	if gdrive.IsConfigured() {
		gdriveOAuthConfig, err := gdrive.BaseOAuthConfig()
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init google drive oauth config: %w", err)
		}
		knowledgeGDriveConnector = gdrive.NewConnector(gdriveOAuthConfig)
		fmt.Printf("[API] Knowledge: connecteur Google Drive activé\n")
	}
	var knowledgeSharePointConnector *sharepoint.Connector
	if sharepoint.IsConfigured() {
		sharepointOAuthConfig, err := sharepoint.BaseOAuthConfig()
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init sharepoint oauth config: %w", err)
		}
		knowledgeSharePointConnector = sharepoint.NewConnector(sharepointOAuthConfig)
		fmt.Printf("[API] Knowledge: connecteur SharePoint activé\n")
	}
	var knowledgeOneDriveConnector *onedrive.Connector
	if onedrive.IsConfigured() {
		onedriveOAuthConfig, err := onedrive.BaseOAuthConfig()
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init onedrive oauth config: %w", err)
		}
		knowledgeOneDriveConnector = onedrive.NewConnector(onedriveOAuthConfig)
		fmt.Printf("[API] Knowledge: connecteur OneDrive activé\n")
	}

	settingStore, err := db.NewProviderSettingStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init setting store: %w", err)
	}

	oauthStore, err := db.NewProviderOAuthConnectionStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init provider oauth store: %w", err)
	}

	// Identity mode: standalone (default) vs connected to a seshat-server.
	// This is a boot-time deployment decision, not a live toggle — see
	// helps/seshat-architecture-target.md §1: swapping the identity source of
	// truth while local sessions are active risks leaving the system in a
	// half-migrated state, unlike the automation domain's runtime pairing.
	// Resolved here (rather than closer to where NewApp is called) because
	// the long-term memory store below also needs to know serverURL to pick
	// its own local-vs-remote implementation.
	var authProvider backendauth.Provider
	var settingsProvider backendsettings.Provider
	var preferencesProvider backendpreferences.Provider
	var webSearchCloudClient *cloudwebsearch.Client
	var mcpCloudClient *cloudmcp.Client
	var hooksCloudClient *cloudhooks.Client
	var memoriesProvider backendmemories.Provider
	var agentsCloudClient *cloudagents.Client
	var quotaProvider backendquotas.Provider
	// Constructed here (not down in the "Cloud automation" section below,
	// where the rest of cloudautomation's pieces are wired) because
	// cloudsettings.NewProvider needs it immediately below - the same
	// PolicyStore instance is reused later for the automation Service/Worker,
	// since it's a thin stateless wrapper around the shared *db.DB (safe to
	// construct once and hand out, unlike the DB itself).
	cloudAutomationPolicyStore := cloudautomation.NewPolicyStore(database)
	// Reused later for the automation Service/Worker, same reasoning as
	// cloudAutomationPolicyStore above - a thin stateless wrapper around the
	// shared *db.DB, safe to construct once.
	cloudAutomationVersionStore := cloudautomation.NewVersionStore(database)
	// Reused later for the automation Service/Worker, same reasoning as the
	// two stores above. Also read right below to decide standalone vs
	// connected identity mode.
	cloudAutomationStore := cloudautomation.NewStore(database)
	// Connected mode is decided by whether this device has actually been
	// paired to an organization (Service.Connect/RegisterAndConnect - a
	// deliberate user action that validates a real device token with
	// seshat-server before ever persisting anything), never by whether
	// something merely answers on defaultServerURL right now. That used to
	// be the check here, and it's wrong: defaultServerURL is also the local
	// Docker Compose address anyone developing SeshatCloud runs on their own
	// machine, so a developer with that stack up for unrelated work got
	// silently flipped into connected mode, with no pairing, no token, and
	// no way to use this device at all.
	serverURL := ""
	if conn, err := cloudAutomationStore.Load(ctx); err == nil && conn != nil {
		serverURL = conn.ServerURL
	}
	if serverURL != "" {
		// No organization id configured here - seshat-server enforces at
		// most one organization per user account, so it's resolved fresh
		// per login/request from the caller's own principal instead (see
		// auth.Principal.OrganizationID). A fixed, deployment-time org id
		// used to be required here; it silently produced the wrong role for
		// anyone whose actual membership didn't match it.
		authProvider = cloudidentity.NewProvider(serverURL, cloudidentity.NewCache(database), identityStore)
		localSettingsProvider := backendsettings.NewLocalProvider(settingStore, oauthStore, nil)
		settingsProvider = cloudsettings.NewProvider(serverURL, localSettingsProvider, cloudAutomationPolicyStore)
		preferencesProvider = cloudpreferences.NewProvider(serverURL)
		webSearchCloudClient = cloudwebsearch.NewClient(serverURL)
		mcpCloudClient = cloudmcp.NewClient(serverURL)
		hooksCloudClient = cloudhooks.NewClient(serverURL)
		memoriesProvider = cloudmemories.NewProvider(serverURL)
		agentsCloudClient = cloudagents.NewClient(serverURL)
		quotaProvider = cloudquotas.NewProvider(serverURL)
		fmt.Printf("[API] Identité en mode connected (seshat-server: %s)\n", serverURL)
	}

	// Long-term memory store: db.LongTermMemoryStore (standalone) or
	// cloudlongterm.RemoteStore (connected) — both implement the SDK's
	// longterm.Store interface, so everything downstream (the query
	// runtime's session context and internal/memories.Service) is agnostic
	// to which one it got.
	var longTermMemStore longterm.Store
	if serverURL != "" {
		longTermMemStore = cloudlongterm.NewRemoteStore(serverURL)
	} else {
		localLongTermMemStore, err := db.NewLongTermMemoryStore(database)
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init long-term memory store: %w", err)
		}
		longTermMemStore = localLongTermMemStore
	}

	// Long-term memory extractor: creates a lightweight provider client dedicated to
	// async entity/observation extraction at session end. Best-effort only.
	var longTermExtractor *longterm.Extractor
	if strings.TrimSpace(config.APIKey) != "" {
		parsedModel := appconfig.ParseModelIdentifier(config.Model)
		extractionClient := providers.NewClient(config.APIKey, parsedModel.Provider)
		extractorCfg := longterm.DefaultExtractorConfig()
		extractorCfg.Model = parsedModel
		longTermExtractor = longterm.NewExtractor(longTermMemStore, extractionClient, extractorCfg)
		fmt.Printf("[API] Long-term memory extractor initialisé (provider=%s)\n", parsedModel.Provider)
	}

	modelStore, err := db.NewProviderModelStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init provider model store: %w", err)
	}

	webSearchSettingStore, err := db.NewWebSearchSettingStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init web search setting store: %w", err)
	}

	webSearchLogStore, err := db.NewWebSearchLogStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init web search log store: %w", err)
	}

	searchProviderConfigStore, err := db.NewSearchProviderConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init search provider config store: %w", err)
	}

	embedderConfigStore, err := db.NewEmbedderConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init embedder config store: %w", err)
	}

	capabilityLinkStore, err := db.NewCapabilityLinkStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init capability link store: %w", err)
	}

	documentReaderConfigStore, err := db.NewDocumentReaderConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init document reader config store: %w", err)
	}

	rerankerConfigStore, err := db.NewRerankerConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init reranker config store: %w", err)
	}

	localSTTConfigStore, err := db.NewLocalSTTConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init local stt config store: %w", err)
	}

	sandboxConfigStore, err := db.NewSandboxConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init sandbox config store: %w", err)
	}

	resolveDocumentConverter := func(ctx context.Context) documentreader.Converter {
		cfg, _ := documentReaderConfigStore.Get(ctx)
		baseURL := strings.TrimSpace(config.DocumentReaderURL)
		preferExternal := false
		externalEnabled := false
		if cfg != nil {
			externalEnabled = cfg.Enabled
			preferExternal = cfg.PreferExternal
			if strings.TrimSpace(cfg.BaseURL) != "" {
				baseURL = strings.TrimSpace(cfg.BaseURL)
			}
		} else if baseURL != "" {
			externalEnabled = true
		}

		var external documentreader.Converter
		if externalEnabled && baseURL != "" {
			if client, err := documentreading.NewSeshatIntelligenceClient(baseURL); err == nil {
				external = client
			}
		}
		return documentreading.NewPolicyConverterWithLocalAdvanced(documentreading.NewNativeDocConverter(), external, preferExternal)
	}
	if documentreading.NativeDocAutoInitEnabled() {
		if capabilities, initErr := documentreading.InitNativeDocRuntime(); initErr != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement native OCR: auto-init échouée: %v\n", initErr)
		} else if capabilities.NativeDocReady {
			fmt.Printf("[API] Native OCR initialisé: models=%s\n", documentreading.NativeDocModelsDir())
		}
	}
	userMemoryStore, err := db.NewUserMemoryStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init user memory store: %w", err)
	}

	storageConfigStore, err := db.NewStorageConfigStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init storage config store: %w", err)
	}

	dataflowSecretsService := dataflowsecrets.New(database)

	userPreferencesStore, err := db.NewUserPreferencesStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init user preferences store: %w", err)
	}

	mcpServerStore, err := db.NewMCPServerStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init mcp server store: %w", err)
	}

	mcpOrgServerApprovalStore, err := db.NewMCPOrgServerApprovalStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init mcp org server approval store: %w", err)
	}

	hookOrgApprovalStore, err := db.NewHookOrgApprovalStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init hook org approval store: %w", err)
	}

	agentDefinitionStore, err := db.NewAgentDefinitionStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init agent definition store: %w", err)
	}

	auditLogStore, err := db.NewAuditLogStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init audit log store: %w", err)
	}

	usageCounterStore, err := db.NewUsageCounterStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init usage counter store: %w", err)
	}

	planDocumentStore, err := db.NewPlanDocumentStore(database)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init plan document store: %w", err)
	}

	artifactStore, artifactErr := storage.DefaultArtifactStore()
	if artifactErr != nil {
		if config.StorageProvider != "" && config.StorageProvider != string(storage.ProviderLocal) {
			_ = cleanup()
			return nil, nil, fmt.Errorf("artifact store: %w", artifactErr)
		}
		fmt.Fprintf(os.Stderr, "[API] Avertissement: artifact store non disponible (%v)\n", artifactErr)
		fmt.Fprintf(os.Stderr, "[API] Domaine files désactivé — uploads/downloads ne fonctionneront pas\n")
		artifactStore = nil
	} else {
		fmt.Printf("[API] Artifact store initialisé: %s\n", storage.GetProviderType())
	}
	var documentChunkCache rag.ChunkCache = rag.NewMemoryChunkCache()
	if artifactStore != nil {
		documentChunkCache = rag.NewArtifactChunkCache(artifactStore)
	}
	documentChunker := rag.NewCachedDocumentChunker(
		rag.NewHybridDocumentChunkerForProfile(
			documentreading.NewDynamicHybridChunker(resolveDocumentConverter),
			rag.ChunkProfile{Name: rag.ChunkProfileStructured, MaxTokens: 1024, OverlapTokens: 128},
			documentreader.ChunkOptions{},
		),
		documentChunkCache,
	)
	// Documents (knowledge): standalone local knowledge.Service, or
	// cloudknowledge.RemoteService proxying to a connected seshat-server's
	// own org-wide corpora — both implement knowledge.Backend, and NewApp
	// falls back to the local one when this is nil. See
	// internal/cloudknowledge's package doc for why this is a clean swap
	// rather than an additive merge like MCP.
	//
	// Declared as the knowledge.Backend interface (not *cloudknowledge.
	// RemoteService) so that leaving it unset in standalone mode is a true
	// nil interface — assigning a nil *RemoteService to an interface-typed
	// Dependencies field would produce a non-nil interface holding a nil
	// pointer, defeating NewApp's `if knowledgeService == nil` fallback
	// check. Same reasoning as longTermMemStore above.
	var knowledgeCloudBackend backendknowledge.Backend
	if serverURL != "" {
		knowledgeCloudBackend = cloudknowledge.NewRemoteService(serverURL, fileStore, artifactStore)
	}

	vectorDatabase := database
	if vector.StoreKind(config.VectorStore) == vector.StorePgVector && strings.TrimSpace(config.PgVectorDSN) != "" {
		vectorDB, err := db.Open(ctx, db.Config{
			Driver:      db.DriverPostgres,
			DSN:         strings.TrimSpace(config.PgVectorDSN),
			AutoMigrate: false,
		})
		if err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("init pgvector DB: %w", err)
		}
		vectorDatabase = vectorDB
		cleanups = append(cleanups, vectorDB.Close)
		fmt.Printf("[API] pgvector utilise une DB dédiée PostgreSQL\n")
	}

	var ragService *rag.Service
	var ragVectorStore vector.Store
	var ragEmbedder rag.Embedder
	embedderCfg := &ragembedder.Config{
		BaseURL:  config.EmbedderBaseURL,
		APIKey:   config.EmbedderAPIKey,
		Model:    config.EmbedderModel,
		Provider: ragembedder.Provider(config.EmbedderProvider),
	}
	if dbEmb, dbErr := embedderConfigStore.Get(ctx); dbErr == nil && dbEmb != nil && dbEmb.Enabled && dbEmb.BaseURL != "" && dbEmb.Model != "" {
		apiKeyFromDB, _ := embedderConfigStore.GetDecryptedAPIKey(ctx)
		// An opt-in capability link (Settings > Providers, "Use my <provider>
		// key" - see internal/db/capability_links.go) takes precedence over
		// the embedder's own standalone key, so the same OpenAI credential
		// configured for chat doesn't have to be pasted a second time here.
		if _, linkedKey, ok := resolveCapabilityCredential(ctx, capabilityLinkStore, settingStore, backendsettings.CapabilityEmbeddings); ok {
			apiKeyFromDB = linkedKey
		}
		embedderCfg = &ragembedder.Config{
			BaseURL:  dbEmb.BaseURL,
			APIKey:   apiKeyFromDB,
			Model:    dbEmb.Model,
			Provider: ragembedder.Provider(dbEmb.Provider),
		}
		fmt.Printf("[API] Embedder config chargée depuis DB: provider=%s model=%s\n", dbEmb.Provider, dbEmb.Model)
	}
	// The vector store (and so ragService) is built regardless of whether an
	// embedder is configured — rag.Service itself already degrades to
	// vectorless/BM25-only ingest+search when its embedder is nil (see the
	// SDK's internal/rag/service.go), so gating construction on
	// embedderCfg.IsConfigured() used to disable the whole knowledge feature
	// instead of just skipping vector search. Configuring an embedder later
	// and re-ingesting upgrades existing chunks in place (Ingest upserts by
	// deterministic key), no need to re-upload anything.
	pgvectorCreateExtension := config.PgVectorCreateExtension
	vectorDim := 1536
	if raw := strings.TrimSpace(os.Getenv("SESHAT_VECTOR_DIM")); raw != "" {
		if n, err := fmt.Sscanf(raw, "%d", &vectorDim); n != 1 || err != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: SESHAT_VECTOR_DIM invalide (%q), utilise 1536\n", raw)
			vectorDim = 1536
		} else if vectorDim < 64 || vectorDim > 4096 {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: SESHAT_VECTOR_DIM hors limites (%d, accepté: 64-4096), utilise 1536\n", vectorDim)
			vectorDim = 1536
		}
	}
	vectorCfg := vector.Config{
		StoreKind:                  vector.StoreKind(config.VectorStore),
		DB:                         vector.NewDBHandle(string(vectorDatabase.Driver()), vectorDatabase.DSN()),
		Dim:                        vectorDim,
		QdrantHost:                 config.QdrantHost,
		QdrantPort:                 config.QdrantPort,
		QdrantAPIKey:               config.QdrantAPIKey,
		QdrantPrefix:               config.QdrantPrefix,
		PgVectorCreateExtension:    &pgvectorCreateExtension,
		PgVectorIndexMethod:        config.PgVectorIndexMethod,
		PgVectorHNSWM:              config.PgVectorHNSWM,
		PgVectorHNSWEfConstruction: config.PgVectorHNSWEF,
		PgVectorIVFFlatLists:       config.PgVectorIVFFlatLists,
		ChromaURL:                  config.ChromaURL,
		ChromaAPIKey:               config.ChromaAPIKey,
		ChromaTenant:               config.ChromaTenant,
		ChromaDatabase:             config.ChromaDatabase,
	}
	if vs, err := vector.NewStore(ctx, vectorCfg); err == nil {
		var embedder rag.Embedder
		if embedderCfg.IsConfigured() {
			embedder = ragembedder.New(embedderCfg)
		}
		ragService = rag.NewService(artifactStore, vs, embedder, documentChunker)
		ragVectorStore = vs
		ragEmbedder = embedder
		backendName := string(vectorCfg.StoreKind)
		if backendName == "" {
			backendName = "sqlite"
		}
		if embedderCfg.IsConfigured() {
			fmt.Printf("[API] RAG service initialisé: embedder=%s model=%s backend=%s\n", embedderCfg.Provider, embedderCfg.Model, backendName)
		} else {
			fmt.Printf("[API] RAG service initialisé en mode vectorless (BM25) — aucun embedder configuré, backend=%s\n", backendName)
		}

		if dbReranker, dbErr := rerankerConfigStore.Get(ctx); dbErr == nil && dbReranker != nil && dbReranker.Enabled && dbReranker.BaseURL != "" {
			apiKey, _ := rerankerConfigStore.GetDecryptedAPIKey(ctx)
			ragService.SetReranker(reranker.New(reranker.Config{
				BaseURL: dbReranker.BaseURL,
				APIKey:  apiKey,
				Model:   dbReranker.Model,
			}))
			fmt.Printf("[API] RAG reranker actif: model=%s\n", dbReranker.Model)
		} else {
			// RAG_RERANK_URL points at any Cohere/TEI-compatible endpoint
			// (self-hosted TEI/vLLM serving BAAI/bge-reranker-v2-m3, free and
			// no API key needed) - falls back to LangSearch's hosted API if
			// only LANGSEARCH_API_KEY is set. See reranker.FromEnv's doc.
			if r := reranker.NewFromEnv(); r.IsConfigured() {
				ragService.SetReranker(r)
				fmt.Printf("[API] RAG reranker actif (second passage sur les résultats de recherche)\n")
			}
		}
	} else {
		fmt.Fprintf(os.Stderr, "[API] Avertissement: vector store non disponible (%v)\n", err)
	}

	// Auto-import mcp.json into DB so the UI and runtime share the same state.
	// Idempotent: ON CONFLICT (name) DO UPDATE — user edits in the UI are preserved.
	if localCfg, localErrs := mcpLoadLocalJSON(); len(localCfg.MCPServers) > 0 && len(localErrs) == 0 {
		if n, importErr := mcpServerStore.ImportFromMcpJSON(ctx, localCfg); importErr != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement MCP: import mcp.json: %v\n", importErr)
		} else if n > 0 {
			fmt.Printf("[API] MCP: %d server(s) importés depuis mcp.json\n", n)
		}
	}

	var startupMCPServers []sdk.MCPServerConfig
	if dbServers, dbErr := mcpServerStore.ListEnabled(ctx); dbErr == nil && len(dbServers) > 0 {
		startupMCPServers = append(startupMCPServers, dbMCPServersToSDKConfigs(dbServers)...)
		fmt.Printf("[API] MCP: %d server(s) chargés depuis la DB\n", len(dbServers))
	}

	browserRemoteControlURL := strings.TrimSpace(config.BrowserRemoteControlURL)
	if browserRemoteControlURL == "" {
		browserRemoteControlURL = discoverElectronBrowserRemoteControlURL(ctx)
	}

	titleBroker := backendquery.NewTitleBroker()
	defaultModel := appconfig.ParseModelIdentifier(config.Model)
	titleModel := appconfig.ParseModelIdentifier(config.TitleModel)
	queryClientConfig := &sdk.ClientConfig{
		APIKey:              config.APIKey,
		Model:               defaultModel,
		TitleModel:          titleModel,
		TitleProviderConfig: titleProviderConfigFromAppConfig(config, titleModel),
		LocalTitle:          localTitleConfigFromAppConfig(config),
		PermissionMode:      sdk.PermissionModeNever,
		MaxTokens:           backendquery.InteractiveMaxTokensForModel(defaultModel),
		AutoCompact:         true,
		PersistSessions:     true,
		EnableMonitoring:    true,
		SessionSQLitePath:   appconfig.EffectiveSessionDBPath(config),
		WorkingDir:          workingDir,
		// Desktop default: try Docker sandboxing for bash tool execution,
		// with a sane zero-value SandboxDocker config. RequireSandbox stays
		// false (the zero value) — the SDK itself documents that refusing to
		// run bash entirely is worse desktop UX than a visible, logged
		// fallback to unconfined execution when Docker isn't installed or
		// running; NewTool already handles that fallback silently and safely
		// (internal/tools/bash/bash.go's NewTool, seshat SDK).
		SandboxKind:             sdk.SandboxKindDocker,
		BrowserRemoteControlURL: browserRemoteControlURL,
		BrowserExecutablePath:   strings.TrimSpace(config.BrowserExecutablePath),
		StorageGCEnabled:        config.StorageGCEnabled,
		StorageGCInterval:       parseDurationOrDefault(config.StorageGCInterval, time.Hour),
		StorageGCLimit:          config.StorageGCLimit,
		StorageGCNamespaces:     splitCommaList(config.StorageGCNamespaces),
		RAGService:              ragService,
		MCPServers:              startupMCPServers,
		PlanStore:               &dbPlanStoreAdapter{store: planDocumentStore},
		LongTermMemory:          longTermMemStore,
		DocumentConverter:       documentreading.NewProcessorConverter(resolveDocumentConverter),
		DocumentPageRenderer:    documentreading.NewNativeDocPageRenderer(),
		AutomationServiceURL:    strings.TrimSpace(config.AutomationServiceURL),
		AutomationAPIKey:        strings.TrimSpace(os.Getenv("AUTOMATION_API_KEY")),
		ImageGeneration:         defaultImageGenerationConfig(ctx, capabilityLinkStore, settingStore),
		TextToSpeech:            defaultTextToSpeechConfig(ctx, capabilityLinkStore, settingStore),
		SpeechToText:            defaultSpeechToTextConfig(ctx, capabilityLinkStore, settingStore),
		// The SDK auto-generates a short AI title after a session's first
		// turn completes (see its own generateTitleAsync) and was already
		// running unconditionally - just silently discarded, since nothing
		// here used to set this callback. This is the only thing that
		// writes it into session_ownership.Title, the column the API and
		// UI actually read (the SDK's own internal session store, which it
		// updates on its own, is invisible to this backend). Client is nil
		// during this call, so context.Background() is the only option.
		OnSessionTitled: func(id sdk.SessionID, title string) {
			if err := sessionOwnershipStore.UpdateTitle(context.Background(), id.String(), title); err != nil {
				fmt.Fprintf(os.Stderr, "[API] session %s auto-title: %v\n", id, err)
			}
			titleBroker.Notify(id.String(), title)
		},
	}
	queryClient, err := sdk.NewClient(queryClientConfig)
	if err != nil {
		_ = cleanup()
		return nil, nil, fmt.Errorf("init query runtime: %w", err)
	}
	cleanups = append(cleanups, func() error { queryClient.Close(); return nil })
	// The kind actually resolved to (Docker only if it passed its health
	// check; Local otherwise) — not just what was requested above. See
	// api.App's sandboxKind field for how this reaches /system/status.
	sandboxKind := string(queryClient.SandboxKind())

	if err := managedskills.EnsureExtracted(skillsloader.GetBuiltinSkillsPath()); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement builtin skills: %v\n", err)
	} else {
		fmt.Printf("[API] Builtin skills extraits vers: %s\n", skillsloader.GetBuiltinSkillsPath())
	}

	// Clone the official Seshat skills collection in the background so startup is
	// never blocked.
	go func() {
		defaultRepoURL := api.DefaultSeshatSkillsRepo
		if config.DefaultSkillRepo != "" {
			defaultRepoURL = strings.TrimSpace(config.DefaultSkillRepo)
		}
		if defaultRepoURL != "" && strings.ToLower(defaultRepoURL) != "none" {
			repo := skillrepos.RepoFromURL(defaultRepoURL)
			skillrepos.EnsureCloned(ctx, skillsloader.GetSkillReposPath(), []skillrepos.Repo{repo})
			fmt.Printf("[API] Seshat skills: %s disponible\n", repo.Name)
		}
	}()

	if repos := skillrepos.ParseRepos(config.SkillRepos); len(repos) > 0 {
		var secureRepos []skillrepos.Repo
		for _, repo := range repos {
			if repo.URL != "" && !strings.HasPrefix(repo.URL, "https://") {
				fmt.Fprintf(os.Stderr, "[API] AVERTISSEMENT SÉCURITÉ: skill repo non-HTTPS ignoré: %s\n", repo.URL)
				continue
			}
			secureRepos = append(secureRepos, repo)
		}
		if len(secureRepos) > 0 {
			cloned := skillrepos.EnsureCloned(ctx, skillsloader.GetSkillReposPath(), secureRepos)
			fmt.Printf("[API] Skill repos: %d/%d disponibles\n", len(cloned), len(repos))
		}
	}

	if entries, err := os.ReadDir(skillsloader.GetSkillReposPath()); err == nil {
		var installed []skillrepos.Repo
		for _, e := range entries {
			// skillrepos.EnsureCloned keeps its own bookkeeping in a
			// ".pull-stamps" subdir of the same directory - skip dotfiles so
			// it isn't re-listed here as a fake repo with no URL.
			if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
				installed = append(installed, skillrepos.Repo{Name: e.Name()})
			}
		}
		if len(installed) > 0 {
			skillrepos.EnsureCloned(ctx, skillsloader.GetSkillReposPath(), installed)
		}
	}

	featuredRepos := append([]api.FeaturedSkillRepo(nil), api.DefaultFeaturedRepos...)
	if config.FeaturedSkillRepos != "" {
		var extra []api.FeaturedSkillRepo
		for _, raw := range strings.Split(config.FeaturedSkillRepos, ",") {
			raw = strings.TrimSpace(raw)
			if raw == "" {
				continue
			}
			repo := skillrepos.RepoFromURL(raw)
			found := false
			for _, d := range featuredRepos {
				if d.Name == repo.Name {
					found = true
					break
				}
			}
			if !found {
				extra = append(extra, api.FeaturedSkillRepo{Name: repo.Name, URL: repo.URL})
			}
		}
		featuredRepos = append(featuredRepos, extra...)
	}

	if config.AdminEmail != "" {
		if strings.TrimSpace(config.AdminPassword) != "" && strings.TrimSpace(config.AdminPasswordHash) == "" {
			fmt.Fprintf(os.Stderr, "[API] AVERTISSEMENT SÉCURITÉ: SESHAT_ADMIN_PASSWORD est défini en clair dans l'environnement.\n")
			fmt.Fprintf(os.Stderr, "[API]   Préférez SESHAT_ADMIN_PASSWORD_HASH (bcrypt) pour la production.\n")
			fmt.Fprintf(os.Stderr, "[API]   Générez-le avec: htpasswd -bnBC 12 '' <mot_de_passe> | tr -d ':\\n' | sed 's/$2y/$2a/'\n")
			if strings.EqualFold(strings.TrimSpace(os.Getenv("SESHAT_ENV")), "production") {
				_ = cleanup()
				return nil, nil, fmt.Errorf("SESHAT_ENV=production interdit SESHAT_ADMIN_PASSWORD en clair")
			}
		}
		if h := strings.TrimSpace(config.AdminPasswordHash); h != "" {
			if _, err := bcrypt.Cost([]byte(h)); err != nil {
				_ = cleanup()
				return nil, nil, fmt.Errorf("SESHAT_ADMIN_PASSWORD_HASH n'est pas un hash bcrypt valide: %w", err)
			}
			if strings.TrimSpace(config.AdminPassword) != "" {
				fmt.Fprintf(os.Stderr, "[API] AVERTISSEMENT: SESHAT_ADMIN_PASSWORD et SESHAT_ADMIN_PASSWORD_HASH sont tous les deux définis. SESHAT_ADMIN_PASSWORD_HASH sera utilisé.\n")
			}
		}
		if _, err := identityStore.EnsureBootstrap(ctx, db.BootstrapOptions{
			AdminEmail:           config.AdminEmail,
			AdminPassword:        config.AdminPassword,
			AdminPasswordHash:    config.AdminPasswordHash,
			AdminDisplayName:     "Administrator",
			DefaultOrgName:       "Default Organization",
			DefaultOrgSlug:       "default",
			DefaultWorkspaceName: "Main Workspace",
			DefaultWorkspaceSlug: "main",
		}); err != nil {
			_ = cleanup()
			return nil, nil, fmt.Errorf("bootstrap DB: %w", err)
		}
	}

	runtime := backendquery.NewSDKRuntime(queryClient, queryClientConfig)
	cleanups = append(cleanups, func() error { runtime.CloseCachedClients(); return nil })
	if strings.TrimSpace(config.BrowserRemoteControlURL) == "" {
		runtime.SetBrowserRemoteControlResolver(discoverElectronBrowserRemoteControlURL)
	}
	// Unconditional - resolveElectronBrowserSessionTarget itself no-ops
	// (returns ok=false) whenever SESHAT_ELECTRON_BRIDGE_PORT isn't set, so
	// this is a no-op outside the desktop app without needing a guard here.
	runtime.SetBrowserSessionTargetResolver(resolveElectronBrowserSessionTarget)
	// Shared with api.NewApp below (via AppConfig.TerminalRelay) - the WS
	// handler there registers a session's Electron relay connection into the
	// same instance runtime.applyRemoteExecutor reads from per turn.
	terminalRelay := backendquery.NewTerminalRelay()
	runtime.SetTerminalRelay(terminalRelay)

	// Scopes the rag_search/rag_ingest/rag_delete tools to the requesting
	// user's own (or shared-workspace) corpora per request, instead of
	// every Main Chat turn sharing the one process-wide ragService - see
	// SDKRuntime.SetRAGComponents and userScopedVectorStore for why this
	// matters (rag_search's corpus_id argument is model-supplied and was
	// otherwise unchecked). No-op when RAG isn't configured at all
	// (ragVectorStore/ragEmbedder stay nil).
	if ragVectorStore != nil {
		runtime.SetRAGComponents(artifactStore, ragVectorStore, ragEmbedder, documentChunker, corpusStore)
	}

	// Mirrors resolveDocumentConverter below: Settings > Capabilities can point the
	// agent's own speech_to_text tool at a locally running whisper.cpp
	// server (see api.handleLocalSTTConfig, set by the Electron main
	// process) instead of the operator's OPENAI_API_KEY default, without a
	// restart. No API key needed - the engine no longer requires one when a
	// custom BaseURL is set (KPO-Tech/seshat#101), and whisper-server
	// doesn't check the Authorization header anyway.
	runtime.SetLocalSTTResolver(func(ctx context.Context) *sdk.SpeechToTextConfig {
		cfg, err := localSTTConfigStore.Get(ctx)
		if err != nil || cfg == nil || !cfg.Enabled || cfg.BaseURL == "" {
			return nil
		}
		return &sdk.SpeechToTextConfig{
			Provider: "openai",
			BaseURL:  cfg.BaseURL,
		}
	})

	// Settings > Environment lets the user choose Docker-sandboxed vs direct
	// host execution for the bash tool (see db.SandboxConfigStore) - no
	// stored choice (a fresh install) resolves to SandboxModeLocal, not the
	// bootstrap default above: an agent asked to write a document, move a
	// file, or run/test code the user is working on needs real access to the
	// user's own machine, not an isolated container that can't see any of
	// it. ok=false (a genuine store read error) falls through to
	// queryClientConfig's own SandboxKind above instead.
	runtime.SetSandboxModeResolver(func(ctx context.Context) (sdk.SandboxKind, bool) {
		cfg, err := sandboxConfigStore.Get(ctx)
		if err != nil {
			return "", false
		}
		if cfg == nil || strings.TrimSpace(cfg.Mode) != db.SandboxModeDocker {
			return sdk.SandboxKindLocal, true
		}
		return sdk.SandboxKindDocker, true
	})

	// ActionConnectors: one entry per MCP-backed connector.ActionConnector
	// (see internal/mcp/action and helps/roadmap.md Phase 3). "demo-crm" is
	// the first concrete instance, not a hardcoded special case - any MCP
	// server registered under a different name (via the existing generic
	// /mcp API/Settings UI) can be wrapped the same way by adding another
	// entry here. Resolution of whether that server is actually configured
	// happens per-call in Connector.Act, not here.
	demoCRMConnector := mcpAction.NewConnector(mcpServerStore, "demo-crm")
	actionConnectors := map[string]connector.ActionConnector{
		string(demoCRMConnector.Kind()): demoCRMConnector,
	}

	// KnowledgeConnectors: the generic counterpart of actionConnectors above,
	// for connector.KnowledgeConnector implementations reached via the
	// generic POST .../accounts/{id}/sync route (internal/app.go's NewApp
	// wires this instance's text extractor once knowledgeService exists,
	// same reasoning as Drive's WithTextExtractor call there).
	s3Connector := s3.NewConnector()
	azureBlobConnector := azureblob.NewConnector()
	knowledgeConnectors := map[string]connector.KnowledgeConnector{
		string(s3.Kind):        s3Connector,
		string(azureblob.Kind): azureBlobConnector,
	}
	if knowledgeSharePointConnector != nil {
		knowledgeConnectors[string(sharepoint.Kind)] = knowledgeSharePointConnector
	}
	if knowledgeOneDriveConnector != nil {
		knowledgeConnectors[string(onedrive.Kind)] = knowledgeOneDriveConnector
	}

	backendApp := seshat.NewApp(seshat.Dependencies{
		Identity:            identityStore,
		APIKeyStore:         apiKeyStore,
		AuthProvider:        authProvider,
		SettingsProvider:    settingsProvider,
		PreferencesProvider: preferencesProvider,
		MemoriesProvider:    memoriesProvider,
		AgentsCloudClient:   agentsCloudClient,
		QuotaProvider:       quotaProvider,
		DesktopPolicies:     cloudAutomationPolicyStore,
		AuthConfig: backendauth.ServiceConfig{
			EnableSignup:    config.EnableSignup,
			DefaultUserRole: config.DefaultUserRole,
			EnableAPIKeys:   config.EnableAPIKeys,
		},
		QueryRuntime:             runtime,
		SessionManager:           runtime,
		SessionOwnership:         sessionOwnershipStore,
		FileStore:                fileStore,
		CorpusStore:              corpusStore,
		IngestionJobStore:        ingestionJobStore,
		KnowledgeBackend:         knowledgeCloudBackend,
		SettingStore:             settingStore,
		OAuthStore:               oauthStore,
		WebSearchSettings:        webSearchSettingStore,
		WebSearchLogs:            webSearchLogStore,
		WebSearchProviderConfigs: searchProviderConfigStore,
		WebSearchCloudClient:     webSearchCloudClient,
		AuditLogStore:            auditLogStore,
		UsageCounterStore:        usageCounterStore,
		ArtifactStore:            artifactStore,
		RAGService:               ragService,
		Monitoring:               queryClient.GetMonitoring(),
		ResolveDocumentConverter: resolveDocumentConverter,
		UserMemoryStore:          userMemoryStore,
		LongTermMemoryStore:      longTermMemStore,
		LongTermExtractor:        longTermExtractor,
		PlanDocumentStore:        planDocumentStore,
		MCPServerStore:           mcpServerStore,
		MCPRuntime:               runtime,
		MCPCloudClient:           mcpCloudClient,
		MCPOrgServerApprovals:    mcpOrgServerApprovalStore,
		HooksRuntime:             runtime,
		HooksCloudClient:         hooksCloudClient,
		HookOrgApprovals:         hookOrgApprovalStore,
		UserPreferencesStore:     userPreferencesStore,
		AgentDefinitionStore:     agentDefinitionStore,
		KnowledgeGDrive:          knowledgeGDriveConnector,
		KnowledgeGDriveAccounts:  connectorAccountStore,
		ConnectorAccounts:        connectorAccountStore,
		ActionConnectors:         actionConnectors,
		KnowledgeConnectors:      knowledgeConnectors,
	})

	// knowledge_search: lets the Company Assistant (and any other session on
	// this shared query client) search across every corpus the calling
	// principal can access, not just one - see internal/knowledge/tool's
	// package doc. Registered here (not next to sdk.NewClient above) because
	// it needs the fully-resolved backendApp.Knowledge (local
	// *knowledge.Service or connected-mode *cloudknowledge.RemoteService),
	// which only exists after seshat.NewApp runs its own fallback logic.
	if backendApp.Knowledge != nil {
		if err := queryClient.RegisterTool(knowledgeAgentTools.NewSearchTool(backendApp.Knowledge)); err != nil {
			fmt.Fprintf(os.Stderr, "[API] Avertissement: knowledge_search tool non enregistré: %v\n", err)
		}
	}

	// Cloud automation: this machine executes execution_target=device jobs
	// claimed from a connected seshat-server, using its own locally
	// configured LLM credentials — see helps/seshat-architecture-target.md
	// and internal/cloudautomation's package doc. The executor closure
	// captures backendApp so the cloudautomation package never needs to
	// import query/settings directly, mirroring the old scheduler's pattern.
	// cloudAutomationStore itself was already constructed above, where the
	// standalone-vs-connected decision needs to read it.
	cloudAutomationExecutor := cloudautomation.JobExecutor(func(ctx context.Context, p cloudautomation.ExecParams) (string, error) {
		principal := &backendauth.Principal{
			User: backendauth.User{ID: p.UserID},
		}
		providerSettingID, modelID := resolveCloudJobModel(ctx, backendApp.Settings, principal, p.ModelOverride)
		input, _ := backendApp.Query.BuildContextInput(ctx, backendquery.ContextBuildParams{
			Principal:         principal,
			Prompt:            p.Prompt,
			ProviderSettingID: providerSettingID,
			ModelID:           modelID,
			ExecutionOrigin:   enginetypes.ExecutionOriginAutomation,
		})
		result, err := backendApp.Query.RunPrompt(ctx, principal, input)
		if err != nil {
			return "", err
		}
		return result.Content, nil
	})
	cloudAutomationWorker := cloudautomation.NewWorker(cloudAutomationStore, cloudAutomationPolicyStore, cloudAutomationVersionStore, cloudAutomationExecutor)
	cloudAutomationWorker.Start()
	cleanups = append(cleanups, func() error { cloudAutomationWorker.Stop(); return nil })
	cloudAutomationService := cloudautomation.NewService(cloudAutomationStore, cloudAutomationPolicyStore, cloudAutomationVersionStore)
	fmt.Printf("[API] Cloud automation worker démarré\n")

	// Abandoned-session sweep: a session (plus any files attached to it) is
	// created the instant a file is attached, before the user ever sends a
	// message (see Home.tsx/Conversation.tsx) - if they change their mind or
	// just close the app, nothing else ever cleans that up. Sweeping
	// sessions with zero turns older than the grace window reclaims that
	// dead weight without any risk of deleting a conversation someone is
	// actively about to use (see query.Service.SweepAbandonedSessions).
	const abandonedSessionGracePeriod = 24 * time.Hour
	sweepCtx, stopSweep := context.WithCancel(context.Background())
	go func() {
		// Run once at startup too, not just on the hourly tick - this is a
		// desktop app, so most sessions are shorter than an hour and would
		// otherwise never live long enough to trigger the ticker even once.
		// Startup is exactly when abandoned sessions from the *previous*
		// run are most likely waiting to be cleaned up.
		if n, err := backendApp.Query.SweepAbandonedSessions(sweepCtx, abandonedSessionGracePeriod); err != nil {
			fmt.Fprintf(os.Stderr, "[API] abandoned-session sweep: %v\n", err)
		} else if n > 0 {
			fmt.Printf("[API] abandoned-session sweep: removed %d session(s)\n", n)
		}

		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-sweepCtx.Done():
				return
			case <-ticker.C:
				n, err := backendApp.Query.SweepAbandonedSessions(sweepCtx, abandonedSessionGracePeriod)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[API] abandoned-session sweep: %v\n", err)
				} else if n > 0 {
					fmt.Printf("[API] abandoned-session sweep: removed %d session(s)\n", n)
				}
			}
		}
	}()
	cleanups = append(cleanups, func() error { stopSweep(); return nil })

	app := api.NewApp(api.AppConfig{
		Backend:               backendApp,
		DB:                    database,
		ModelStore:            modelStore,
		EmbedderStore:         embedderConfigStore,
		CapabilityLinkStore:   capabilityLinkStore,
		ProviderSettingStore:  settingStore,
		DocumentReaderStore:   documentReaderConfigStore,
		RerankerStore:         rerankerConfigStore,
		LocalSTTStore:         localSTTConfigStore,
		SandboxConfigStore:    sandboxConfigStore,
		StorageConfigStore:    storageConfigStore,
		DataflowSecrets:       dataflowSecretsService,
		LongTermExtractor:     longTermExtractor,
		CloudAutomation:       cloudAutomationService,
		RAGService:            ragService,
		RateLimiter:           api.NewRateLimiter(config.RateLimitPerMinute, time.Minute),
		LoginRateLimiter:      api.NewRateLimiter(10, 15*time.Minute),
		EnableSignup:          config.EnableSignup,
		EnableAPIKeys:         config.EnableAPIKeys,
		FeaturedRepos:         featuredRepos,
		TrustedProxyCIDRs:     api.ParseTrustedProxies(config.TrustedProxies),
		AllowedSkillRepoHosts: api.ParseSkillRepoHosts(config.SkillRepoHosts),
		ConnectedServerURL:    serverURL,
		TargetServerURL:       defaultServerURL,
		SandboxKind:           sandboxKind,
		TerminalRelay:         terminalRelay,
		TitleBroker:           titleBroker,
	})

	// Only the local knowledge.Service has a queue for this runner to drain —
	// in connected mode backendApp.Knowledge is a *cloudknowledge.RemoteService
	// instead, and a connected seshat-server already runs its own ingestion
	// pipeline server-side (internal/server/knowledge.Runner), so there is
	// nothing for a local runner to do.
	if localKnowledge, ok := backendApp.Knowledge.(*backendknowledge.Service); ok {
		knowledgeRunner := backendknowledge.NewRunner(localKnowledge, backendknowledge.RunnerConfig{
			PollInterval: 500 * time.Millisecond,
			MaxPerTick:   4,
		})
		knowledgeRunner.Start(ctx)
	}

	return app, cleanup, nil
}

// ─── MCP helpers ──────────────────────────────────────────────────────────────

// dbMCPServersToSDKConfigs converts enabled DB MCPServer records to sdk.MCPServerConfig slice.
func dbMCPServersToSDKConfigs(servers []db.MCPServer) []sdk.MCPServerConfig {
	out := make([]sdk.MCPServerConfig, 0, len(servers))
	for _, s := range servers {
		if !s.Enabled {
			continue
		}
		out = append(out, sdk.MCPServerConfig{
			Name:      s.Name,
			Command:   s.Command,
			Args:      s.Args,
			URL:       s.URL,
			Transport: mcp.TransportType(s.ServerType),
			Env:       s.Env,
			Headers:   s.Headers,
			Timeout:   time.Duration(s.TimeoutSecs) * time.Second,
		})
	}
	return out
}

// mcpLoadLocalJSON loads the local mcp.json if it exists (best-effort, no error on missing).
func mcpLoadLocalJSON() (mcp.McpJsonConfig, []mcp.ValidationError) {
	path := api.DefaultMCPJsonPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return mcp.McpJsonConfig{}, nil
	}
	return mcp.ParseMcpConfigFromFile(path)
}

// ─── Plan store adapter ───────────────────────────────────────────────────────

// dbPlanStoreAdapter bridges db.PlanDocumentStore to the sdk.PlanStore interface.
type dbPlanStoreAdapter struct {
	store *db.PlanDocumentStore
}

func (a *dbPlanStoreAdapter) CreateOrUpdate(ctx context.Context, planID, sessionID, userID, slug, filename, content string) (string, int, error) {
	if planID == "" {
		b := make([]byte, 12)
		_, _ = rand.Read(b)
		planID = hex.EncodeToString(b)
	}
	doc, err := a.store.Upsert(ctx, db.CreatePlanParams{
		ID:        planID,
		SessionID: sessionID,
		UserID:    userID,
		Slug:      slug,
		Filename:  filename,
		Content:   content,
	})
	if err != nil {
		return "", 0, err
	}
	return doc.ID, doc.Version, nil
}

func (a *dbPlanStoreAdapter) SetStatus(ctx context.Context, planID string, status string) error {
	return a.store.SetStatus(ctx, planID, status)
}

// ─── Infrastructure helpers ───────────────────────────────────────────────────

// logProviderDiscovery scans env vars and local services at startup and logs a
// summary so operators know which providers are ready without manual inspection.
func logProviderDiscovery(ctx context.Context) {
	results := providers.DiscoverProviders(ctx)

	var available, missing []string
	for _, r := range results {
		if !r.Recommended {
			continue
		}
		if r.Available {
			available = append(available, r.DisplayName)
		} else {
			missing = append(missing, fmt.Sprintf("%s (%s)", r.DisplayName, r.Hint))
		}
	}

	if len(available) > 0 {
		fmt.Printf("[providers] Available: %s\n", strings.Join(available, ", "))
	} else {
		fmt.Fprintln(os.Stderr, "[providers] Warning: no providers configured. Set at least one API key.")
	}
	if len(missing) > 0 {
		for _, m := range missing {
			fmt.Printf("[providers] Not configured: %s\n", m)
		}
	}
}

// ─── Config parsing helpers ───────────────────────────────────────────────────

func parseDurationOrDefault(raw string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func splitCommaList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			result = append(result, part)
		}
	}
	return result
}

// resolveCapabilityCredential looks up an opt-in capability link (Settings
// > Providers, "Use my <provider> key" — see internal/db/capability_links.go
// and internal/settings/capabilities.go) and returns the linked provider's
// type and decrypted API key, if one is configured and still resolves to a
// real provider setting. Never errors: a missing link, a deleted provider,
// or a store that failed to initialize all just mean "not linked" (ok =
// false), so callers fall back to their own default the same as before this
// feature existed.
func resolveCapabilityCredential(ctx context.Context, linkStore *db.CapabilityLinkStore, providerStore *db.ProviderSettingStore, capability backendsettings.Capability) (providerType, apiKey string, ok bool) {
	if linkStore == nil || providerStore == nil {
		return "", "", false
	}
	providerSettingID, linked, err := linkStore.Get(ctx, string(capability))
	if err != nil || !linked {
		return "", "", false
	}
	setting, err := providerStore.GetByID(ctx, providerSettingID)
	if err != nil {
		return "", "", false
	}
	key, err := providerStore.GetDecryptedAPIKey(ctx, providerSettingID)
	if err != nil || key == "" {
		return "", "", false
	}
	return setting.Provider, key, true
}

// defaultImageGenerationConfig, defaultTextToSpeechConfig and
// defaultSpeechToTextConfig enable the engine's generate_image/text_to_speech/
// speech_to_text built-in tools whenever a credential is available for that
// capability — first an opt-in capability link to an already-configured chat
// provider (resolveCapabilityCredential), then the corresponding raw env var
// (OPENAI_API_KEY/GOOGLE_API_KEY — same ones the chat model itself resolves
// against, see pkg/config/provider_catalog.go) as a fallback for anyone who
// prefers to configure these independently via Settings > Environment.
// Without either, ClientConfig.ImageGeneration/.TextToSpeech/.SpeechToText
// stay nil and the tools are never initialized.
func defaultImageGenerationConfig(ctx context.Context, linkStore *db.CapabilityLinkStore, providerStore *db.ProviderSettingStore) *sdk.ImageGenerationConfig {
	if providerType, key, ok := resolveCapabilityCredential(ctx, linkStore, providerStore, backendsettings.CapabilityImage); ok {
		return &sdk.ImageGenerationConfig{Provider: providerType, APIKey: key}
	}
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		return &sdk.ImageGenerationConfig{Provider: "openai", APIKey: key}
	}
	if key := strings.TrimSpace(os.Getenv("GOOGLE_API_KEY")); key != "" {
		return &sdk.ImageGenerationConfig{Provider: "gemini", APIKey: key}
	}
	return nil
}

func defaultTextToSpeechConfig(ctx context.Context, linkStore *db.CapabilityLinkStore, providerStore *db.ProviderSettingStore) *sdk.TextToSpeechConfig {
	if providerType, key, ok := resolveCapabilityCredential(ctx, linkStore, providerStore, backendsettings.CapabilityAudio); ok {
		return &sdk.TextToSpeechConfig{Provider: providerType, APIKey: key}
	}
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		return &sdk.TextToSpeechConfig{Provider: "openai", APIKey: key}
	}
	return nil
}

func defaultSpeechToTextConfig(ctx context.Context, linkStore *db.CapabilityLinkStore, providerStore *db.ProviderSettingStore) *sdk.SpeechToTextConfig {
	if providerType, key, ok := resolveCapabilityCredential(ctx, linkStore, providerStore, backendsettings.CapabilityAudio); ok {
		return &sdk.SpeechToTextConfig{Provider: providerType, APIKey: key}
	}
	if key := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); key != "" {
		return &sdk.SpeechToTextConfig{Provider: "openai", APIKey: key}
	}
	return nil
}

func titleProviderConfigFromAppConfig(config appconfig.Config, titleModel sdk.ModelIdentifier) *providers.Config {
	if strings.TrimSpace(titleModel.Model) == "" || titleModel.Provider == "" {
		return nil
	}
	if strings.TrimSpace(config.TitleModelBaseURL) == "" && strings.TrimSpace(config.TitleModelAPIKey) == "" {
		return nil
	}
	return &providers.Config{
		Provider: titleModel.Provider,
		BaseURL:  strings.TrimSpace(config.TitleModelBaseURL),
		APIKey:   strings.TrimSpace(config.TitleModelAPIKey),
	}
}

func localTitleConfigFromAppConfig(config appconfig.Config) *sdk.LocalTitleConfig {
	if !config.TitleLocalEnabled {
		return nil
	}
	timeout := parseDurationOrDefault(config.TitleLocalTimeout, 30*time.Second)
	return &sdk.LocalTitleConfig{
		Enabled:        true,
		Runtime:        strings.TrimSpace(config.TitleLocalRuntime),
		ExecutablePath: strings.TrimSpace(config.TitleLocalExe),
		ModelPath:      strings.TrimSpace(config.TitleLocalModel),
		HFRepo:         strings.TrimSpace(config.TitleLocalHFRepo),
		HFFile:         strings.TrimSpace(config.TitleLocalHFFile),
		CacheDir:       strings.TrimSpace(config.TitleLocalCache),
		Args:           splitTitleLocalArgs(config.TitleLocalArgs),
		Timeout:        timeout,
	}
}

func splitTitleLocalArgs(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, " ")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// resolveCloudJobModel maps a cloud job's model_override ("provider:model",
// optional) onto this machine's own locally configured provider settings —
// a device-targeted job runs with whoever connected this machine's own LLM
// credentials, never credentials fetched from seshat-server. An empty
// override, or no matching local provider, falls back to the default
// provider/model the same as an ordinary chat turn would.
func resolveCloudJobModel(ctx context.Context, settingsService *backendsettings.Service, principal *backendauth.Principal, modelOverride string) (providerSettingID, modelID string) {
	provider, model, ok := strings.Cut(strings.TrimSpace(modelOverride), ":")
	if !ok || provider == "" {
		return "", ""
	}
	settingsList, err := settingsService.List(ctx, principal)
	if err != nil {
		return "", ""
	}
	for _, setting := range settingsList {
		if strings.EqualFold(setting.Provider, provider) {
			return setting.ID, model
		}
	}
	return "", ""
}
