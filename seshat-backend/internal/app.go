package seshat

import (
	"context"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/agents"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/audit"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/agents"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/hooks"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/mcp"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/websearch"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/files"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/hooks"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/azureblob"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/gdrive"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/onedrive"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/s3"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/sharepoint"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/mcp"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/memories"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/metrics"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/plans"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/preferences"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/query"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skills"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/websearch"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/workflows"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

// Dependencies holds the external dependencies wired by the transport layer.
type Dependencies struct {
	Identity    *db.IdentityStore
	APIKeyStore *db.APIKeyStore // nil = api keys disabled
	AuthConfig  auth.ServiceConfig
	// AuthProvider selects standalone vs connected identity (see ROADMAP.md,
	// "Direction: seshat-server becomes the multi-tenant backbone"). nil =
	// auth.NewLocalProvider(Identity), i.e. today's standalone behavior —
	// set only by bootstrap.go when connected mode is active. Connected mode
	// is not user-configurable: it is decided at boot by a reachability probe
	// against a build-fixed seshat-server URL (defaultServerURL in
	// internal/config/bootstrap.go), deliberately not an environment
	// variable — see that file's doc comment for why.
	AuthProvider      auth.Provider
	QueryRuntime      query.QueryRuntime
	SessionManager    query.SessionManager
	SessionOwnership  *db.SessionOwnershipStore // nil = unscoped mode
	FileStore         *db.FileStore             // nil = files domain disabled
	CorpusStore       *db.CorpusStore           // nil = knowledge domain disabled
	IngestionJobStore *db.KnowledgeIngestionJobStore
	SettingStore      *db.ProviderSettingStore // nil = settings domain disabled
	OAuthStore        *db.ProviderOAuthConnectionStore
	OAuthClients      settings.OAuthClientFactory
	// SettingsProvider selects standalone vs connected provider-settings
	// resolution (org → platform → local personal key). nil =
	// settings.NewLocalProvider(...), i.e. today's local-only behavior — set
	// only by bootstrap.go when connected mode is active (see
	// internal/config/bootstrap.go).
	SettingsProvider         settings.Provider
	WebSearchSettings        *db.WebSearchSettingStore
	WebSearchLogs            *db.WebSearchLogStore
	WebSearchProviderConfigs *db.SearchProviderConfigStore
	WebSearchRunner          websearch.Runner
	// WebSearchCloudClient enriches the local provider-resolution chain and
	// domain policy with a connected seshat-server's org/platform web-search
	// config — nil in standalone mode, set only by bootstrap.go when
	// connected mode is active (see internal/config/bootstrap.go). The
	// organization itself is resolved fresh per call from the caller's own
	// principal (see auth.Principal.OrganizationID), not configured here.
	// See internal/cloudwebsearch's package doc.
	WebSearchCloudClient *cloudwebsearch.Client
	// KnowledgeBackend selects standalone vs connected Documents storage.
	// nil = knowledge.NewService(CorpusStore, FileStore, IngestionJobStore,
	// ArtifactStore, RAGService), i.e. today's local-only behavior — set only
	// by bootstrap.go to a *cloudknowledge.RemoteService when connected mode
	// is active (see internal/config/bootstrap.go). Unlike MCP/agents/
	// web-search (which enrich the local behavior with an org catalog),
	// this is a clean swap: in connected mode
	// there is exactly one set of corpora, the organization's, not local
	// corpora plus org corpora. See internal/cloudknowledge's package doc.
	KnowledgeBackend    knowledge.Backend
	EmbedderConfigStore *db.EmbedderConfigStore
	AuditLogStore       *db.AuditLogStore     // nil = audit logging disabled
	ArtifactStore       storage.ArtifactStore // nil = blob storage disabled
	RAGService          *rag.Service          // nil = embedder not configured
	Monitoring          metrics.Snapshotter
	// ResolveDocumentConverter returns the document converter to use for a given call,
	// re-evaluated on every invocation. Bootstrap wires local-first or
	// external-first policy from the persisted document reader settings.
	ResolveDocumentConverter func(ctx context.Context) documentreader.Converter
	// New services
	UserMemoryStore *db.UserMemoryStore
	// LongTermMemoryStore is longterm.Store (an SDK interface), not a
	// concrete store type — bootstrap.go picks *db.LongTermMemoryStore
	// (standalone) or *cloudlongterm.RemoteStore (connected) before
	// constructing Dependencies. See internal/memories.Service's own
	// longTermStore field for why this is an interface.
	LongTermMemoryStore longterm.Store
	LongTermExtractor   *longterm.Extractor
	PlanDocumentStore   *db.PlanDocumentStore
	MCPServerStore      *db.MCPServerStore
	MCPRuntime          mcp.RuntimeReloader // nil = reload/status not available
	// MCPCloudClient/MCPOrgServerApprovals enrich the local MCP runtime with
	// a connected seshat-server's shared server catalog, once the user has
	// explicitly approved each one — nil in standalone mode, set only by
	// bootstrap.go when connected mode is active (see
	// internal/config/bootstrap.go). The organization itself is resolved
	// fresh per request (see api.requestOrganizationID), not configured
	// here. See internal/cloudmcp's package doc.
	MCPCloudClient        *cloudmcp.Client
	MCPOrgServerApprovals *db.MCPOrgServerApprovalStore
	// HooksRuntime/HooksCloudClient/HookOrgApprovals mirror the MCP fields
	// above exactly, for org-shared PreToolUse hooks - see
	// internal/hooks.Service and
	// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 7.
	// HooksRuntime is nil for workflows.Service's own client, which builds
	// its own sdk.Client per run rather than sharing query's long-lived one
	// - see internal/workflows/service.go.
	HooksRuntime         hooks.RuntimeReloader
	HooksCloudClient     *cloudhooks.Client
	HookOrgApprovals     *db.HookOrgApprovalStore
	UserPreferencesStore *db.UserPreferencesStore
	AgentDefinitionStore *db.AgentDefinitionStore
	// AgentsCloudClient enriches local agent resolution with a connected
	// seshat-server's shared preset catalog, once a caller has an
	// authenticated principal — nil in standalone mode, set only by
	// bootstrap.go when connected mode is active (see
	// internal/config/bootstrap.go). The organization itself is resolved
	// fresh per call from the caller's own principal (see
	// auth.Principal.OrganizationID). Purely additive, see
	// internal/agents.Service's own doc comment.
	AgentsCloudClient *cloudagents.Client
	// PreferencesProvider selects standalone vs connected preferences storage.
	// nil = preferences.NewLocalProvider(UserPreferencesStore), i.e. today's
	// local-only behavior — set only by bootstrap.go when connected mode is
	// active (see internal/config/bootstrap.go).
	PreferencesProvider preferences.Provider
	// MemoriesProvider selects standalone vs connected flat-memory-list
	// storage. nil = memories.NewLocalProvider(UserMemoryStore), i.e.
	// today's local-only behavior — set only by bootstrap.go when connected
	// mode is active (see internal/config/bootstrap.go).
	MemoriesProvider memories.Provider
	// KnowledgeGDrive/KnowledgeGDriveAccounts follow a bootstrap.go-owned,
	// env-var-gated pattern - nil = the Google Drive Knowledge connector is
	// disabled (no routes registered). See helps/roadmap.md Phase 1.
	KnowledgeGDrive         *gdrive.Connector
	KnowledgeGDriveAccounts *db.ConnectorAccountStore
	// ConnectorAccounts is the same generic, kind-agnostic store as
	// KnowledgeGDriveAccounts (identical underlying table - see
	// db.ConnectorAccountStore's own doc comment) but named for its general
	// use across every connector kind, not just Drive. ActionConnectors
	// maps connector.Kind (as a string) to the implementation that should
	// handle a POST .../accounts/{id}/act call for that kind - see
	// internal/mcp/action and helps/roadmap.md Phase 3. Both nil = no Action
	// connector is configured (no routes registered).
	ConnectorAccounts *db.ConnectorAccountStore
	ActionConnectors  map[string]connector.ActionConnector
	// KnowledgeConnectors mirrors ActionConnectors, for the generic
	// POST .../accounts/{id}/sync route - internal/knowledge/s3 is its first
	// entry. Deliberately not used for Drive, which keeps its own dedicated
	// KnowledgeGDrive field/routes (see helps/roadmap.md Phase 3 for why).
	KnowledgeConnectors map[string]connector.KnowledgeConnector
	// DesktopPolicies is this device's last-synced desktop policy bundle
	// (see docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5) -
	// unlike most fields above, always non-nil (bootstrap.go constructs it
	// unconditionally, standalone or connected): in standalone mode, or
	// before this device has ever paired with an organization, it simply
	// has nothing synced and fails open (allows everything), which is the
	// correct behavior, not a special case to guard against here.
	DesktopPolicies *cloudautomation.PolicyStore
}

// App is the root backend service container.
// Each field is a domain service; add new domains here as the product grows.
type App struct {
	Auth        *auth.Service
	Query       *query.Service
	Files       *files.Service
	Knowledge   knowledge.Backend
	Settings    *settings.Service
	WebSearch   *websearch.Service
	Audit       *audit.Service
	Metrics     *metrics.Service
	Memories    *memories.Service
	Plans       *plans.Service
	MCP         *mcp.Service
	Hooks       *hooks.Service
	Preferences *preferences.Service
	Skills      *skills.Service
	Agents      *agents.Service
	Workflows   *workflows.Service

	KnowledgeGDrive         *gdrive.Connector
	KnowledgeGDriveAccounts *db.ConnectorAccountStore
	ConnectorAccounts       *db.ConnectorAccountStore
	ActionConnectors        map[string]connector.ActionConnector
	KnowledgeConnectors     map[string]connector.KnowledgeConnector

	// DesktopPolicies mirrors Dependencies.DesktopPolicies (see its doc
	// comment) - kept on App too, not just consumed inline while building
	// Auth above, because the settings-write middleware (internal/api)
	// needs to read it directly at request time, not just once at boot.
	DesktopPolicies *cloudautomation.PolicyStore
}

func NewApp(deps Dependencies) *App {
	authProvider := deps.AuthProvider
	if authProvider == nil {
		authProvider = auth.NewLocalProvider(deps.Identity, deps.AuthConfig)
	}
	localSettingsProvider := settings.NewLocalProvider(deps.SettingStore, deps.OAuthStore, deps.OAuthClients)
	settingsProvider := deps.SettingsProvider
	if settingsProvider == nil {
		settingsProvider = localSettingsProvider
	}
	settingsService := settings.NewService(settingsProvider, localSettingsProvider)
	webSearchService := websearch.NewService(deps.WebSearchSettings, deps.WebSearchLogs, deps.WebSearchProviderConfigs, settingsService, deps.WebSearchRunner, deps.WebSearchCloudClient)
	memoriesProvider := deps.MemoriesProvider
	if memoriesProvider == nil {
		memoriesProvider = memories.NewLocalProvider(deps.UserMemoryStore)
	}
	memoriesService := memories.NewService(memoriesProvider, deps.LongTermMemoryStore, deps.LongTermExtractor)
	preferencesProvider := deps.PreferencesProvider
	if preferencesProvider == nil {
		preferencesProvider = preferences.NewLocalProvider(deps.UserPreferencesStore)
	}
	preferencesService := preferences.NewService(preferencesProvider)
	filesService := files.NewService(deps.FileStore, deps.ArtifactStore).WithDocumentReader(deps.ResolveDocumentConverter)
	knowledgeService := deps.KnowledgeBackend
	if knowledgeService == nil {
		knowledgeService = knowledge.NewService(deps.CorpusStore, deps.FileStore, deps.IngestionJobStore, deps.ArtifactStore, deps.RAGService).WithDocumentReader(deps.ResolveDocumentConverter)
	}
	// Give the Drive connector the same document-reader extraction an
	// uploaded file gets, instead of ingesting a downloaded PDF/DOCX's raw
	// bytes as text (unsearchable garbage - found via a real end-to-end
	// test, see helps/roadmap.md Phase 1). Only possible against the local
	// *knowledge.Service (IngestExternal's own home) - connected mode's
	// RemoteService isn't wired for connector-driven ingestion in this
	// phase either.
	// Same reasoning applies to any generic KnowledgeConnector that needs
	// Document-reader extraction - internal/knowledge/s3 (Phase 3) is the
	// first one, resolved by kind rather than a dedicated field since
	// KnowledgeConnectors is the generic map, not KnowledgeGDrive's
	// one-off pattern.
	if concreteKnowledge, ok := knowledgeService.(*knowledge.Service); ok {
		if deps.KnowledgeGDrive != nil {
			deps.KnowledgeGDrive.WithTextExtractor(concreteKnowledge.ExtractText)
		}
		if s3Connector, ok := deps.KnowledgeConnectors[string(s3.Kind)].(*s3.Connector); ok {
			s3Connector.WithTextExtractor(concreteKnowledge.ExtractText)
		}
		if spConnector, ok := deps.KnowledgeConnectors[string(sharepoint.Kind)].(*sharepoint.Connector); ok {
			spConnector.WithTextExtractor(concreteKnowledge.ExtractText)
		}
		if azureBlobConnector, ok := deps.KnowledgeConnectors[string(azureblob.Kind)].(*azureblob.Connector); ok {
			azureBlobConnector.WithTextExtractor(concreteKnowledge.ExtractText)
		}
		if oneDriveConnector, ok := deps.KnowledgeConnectors[string(onedrive.Kind)].(*onedrive.Connector); ok {
			oneDriveConnector.WithTextExtractor(concreteKnowledge.ExtractText)
		}
	}
	skillsService := skills.NewService()
	agentsService := agents.NewService(deps.AgentDefinitionStore, deps.AgentsCloudClient)
	return &App{
		Auth: auth.NewService(authProvider, deps.Identity, deps.APIKeyStore, deps.AuthConfig, deps.DesktopPolicies),
		Query: query.NewService(query.ServiceConfig{
			Runtime:     deps.QueryRuntime,
			Sessions:    deps.SessionManager,
			Ownership:   deps.SessionOwnership,
			Settings:    settingsService,
			WebSearch:   webSearchService,
			Memories:    memoriesService,
			Preferences: preferencesService,
			Knowledge:   knowledgeService,
			Files:       filesService,
			Skills:      skillsService,
			Agents:      agentsService,
		}),
		Files:     filesService,
		Knowledge: knowledgeService,
		Settings:  settingsService,
		WebSearch: webSearchService,
		Audit:     audit.NewService(deps.AuditLogStore),
		Metrics:   metrics.NewService(deps.Monitoring),
		Memories:  memoriesService,
		Plans:     plans.NewService(deps.PlanDocumentStore),
		MCP: mcp.NewService(mcp.ServiceConfig{
			Store:       deps.MCPServerStore,
			Runtime:     deps.MCPRuntime,
			CloudClient: deps.MCPCloudClient,
			Approvals:   deps.MCPOrgServerApprovals,
		}),
		Hooks: hooks.NewService(hooks.ServiceConfig{
			Runtime:     deps.HooksRuntime,
			CloudClient: deps.HooksCloudClient,
			Approvals:   deps.HookOrgApprovals,
		}),
		Preferences: preferencesService,
		Skills:      skillsService,
		Agents:      agentsService,

		KnowledgeGDrive:         deps.KnowledgeGDrive,
		KnowledgeGDriveAccounts: deps.KnowledgeGDriveAccounts,
		ConnectorAccounts:       deps.ConnectorAccounts,
		ActionConnectors:        deps.ActionConnectors,
		KnowledgeConnectors:     deps.KnowledgeConnectors,
		Workflows:               workflows.New(settingsService),
		DesktopPolicies:         deps.DesktopPolicies,
	}
}
