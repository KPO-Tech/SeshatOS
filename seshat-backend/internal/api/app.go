package api

import (
	"context"
	"net"
	"sync"
	"time"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/artifactpreview"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendquery "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/query"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// App is the HTTP transport layer. It holds only infrastructure state;
// all business logic lives in seshat.App.
type App struct {
	backend *seshat.App
	db      *db.DB
	// Direct DB stores not yet wrapped in backend services
	modelStore          *db.ProviderModelStore
	embedderStore       *db.EmbedderConfigStore
	capabilityLinkStore *db.CapabilityLinkStore
	// providerSettingStore is used only by the capability-links handlers to
	// list/validate local chat providers as reuse candidates - everything
	// else that needs full provider CRUD/OAuth goes through the abstracted
	// backend.Settings service instead (see internal/settings.Provider),
	// which also supports connected/cloud mode. Capability links and the document reader
	// are genuinely local-device-only concepts (no organization equivalent
	// exists on seshat-server for either), so those two are deliberately the
	// raw local store, not an abstraction. embedderStore is NOT one of these
	// despite living right next to them: handleEmbedderConfig (embedder.go)
	// branches on connected mode and reads/writes seshat-server's real
	// per-organization EmbedderSetting instead once paired - this field is
	// only ever touched directly for the standalone/local path.
	providerSettingStore *db.ProviderSettingStore
	documentReaderStore  *db.DocumentReaderConfigStore
	documentReaderDiagMu sync.Mutex
	documentReaderDiag   *documentReaderDiagnostic
	nativeDocDownloadMu  sync.Mutex
	nativeDocDownload    *nativeDocDownloadState
	rerankerStore        *db.RerankerConfigStore
	localSTTStore        *db.LocalSTTConfigStore
	localTitleStore      *db.LocalTitleConfigStore
	sandboxConfigStore   *db.SandboxConfigStore
	storageConfigStore   *db.StorageConfigStore
	// Long-term memory — kept here because extraction is fire-and-forget
	// and depends on the extractor which lives outside seshat.App lifecycle
	longTermExtractor *longterm.Extractor
	rateLimiter       *RateLimiter
	loginRateLimiter  *RateLimiter
	permBroker        *backendquery.PermissionBroker
	promptBroker      *backendquery.PromptBroker
	titleBroker       *backendquery.TitleBroker
	// terminalRelay is shared with the SDKRuntime constructed in bootstrap.go
	// (via SDKRuntime.SetTerminalRelay) — both need the same instance so a
	// terminal registered here is visible to bash-tool calls there.
	terminalRelay         *backendquery.TerminalRelay
	cloudAutomation       *cloudautomation.Service
	artifactPreviews      *artifactpreview.Store
	ragService            *rag.Service
	enableSignup          bool
	enableAPIKeys         bool
	featuredRepos         []FeaturedSkillRepo
	trustedProxyCIDRs     []*net.IPNet
	allowedSkillRepoHosts []string
	// connectedServerURL is non-empty iff identity runs in connected mode
	// (SESHAT_SERVER_URL configured) — see helps/seshat-architecture-target.md §1.
	// The organization is resolved fresh per request from the caller's own
	// principal (see auth.Principal.OrganizationID) instead of being
	// configured here - seshat-server enforces at most one organization per
	// user account, so there's no deployment-time value to store.
	connectedServerURL string
	// targetServerURL is the seshat-server this build would connect to,
	// always populated from bootstrap.go's defaultServerURL regardless of
	// whether serverReachable actually succeeded - unlike
	// connectedServerURL, this is needed even in standalone mode so the
	// network diagnostics tool (see seshat/pkg/netdiag) can explain *why* the
	// boot-time reachability check failed, rather than having nothing to
	// probe at all.
	targetServerURL string
	// sandboxKind is the bash-tool sandbox backend the query client's SDK
	// Client actually resolved to at boot (sdk.SandboxKindDocker or
	// sdk.SandboxKindLocal, as a string) - see bootstrap.go's
	// queryClient.SandboxKind() call. Not the same fact as
	// sdk.SandboxAvailable() (system.go), which only ever checks Landlock
	// and so can't reflect a Docker sandbox being used instead.
	sandboxKind string
	// transcribeAudio defaults to sdk.TranscribeAudio; overridden in tests to
	// avoid a real network call. baseURL is empty for OpenAI's cloud API, or
	// a local whisper-server URL when local transcription is configured
	// (see local_stt.go) — apiKey is ignored in that case.
	transcribeAudio func(ctx context.Context, apiKey string, audioData []byte, baseURL string) (*sdk.TranscriptionResult, error)
	// oauthStates tracks in-flight OAuth authorization requests across every
	// redirect-based OAuth flow this app handles (Gmail, Google Drive, ...)
	// - state -> issuing principal + expiry, for CSRF protection across the
	// start/callback round trip. A single shared map is safe: state values
	// are random and single-use regardless of which flow issued them. In-
	// memory is fine: this app is a single desktop-local process, and a
	// state is only ever alive for the few seconds/minutes a user takes to
	// complete Google's consent screen.
	oauthMu     sync.Mutex
	oauthStates map[string]oauthState
}

// AppConfig holds all configuration needed to build an App.
type AppConfig struct {
	Backend               *seshat.App
	DB                    *db.DB
	ModelStore            *db.ProviderModelStore
	EmbedderStore         *db.EmbedderConfigStore
	CapabilityLinkStore   *db.CapabilityLinkStore
	ProviderSettingStore  *db.ProviderSettingStore
	DocumentReaderStore   *db.DocumentReaderConfigStore
	RerankerStore         *db.RerankerConfigStore
	LocalSTTStore         *db.LocalSTTConfigStore
	LocalTitleStore       *db.LocalTitleConfigStore
	SandboxConfigStore    *db.SandboxConfigStore
	StorageConfigStore    *db.StorageConfigStore
	LongTermExtractor     *longterm.Extractor
	RateLimiter           *RateLimiter
	LoginRateLimiter      *RateLimiter
	CloudAutomation       *cloudautomation.Service
	RAGService            *rag.Service
	EnableSignup          bool
	EnableAPIKeys         bool
	FeaturedRepos         []FeaturedSkillRepo
	TrustedProxyCIDRs     []*net.IPNet
	AllowedSkillRepoHosts []string
	ConnectedServerURL    string
	// TargetServerURL is always defaultServerURL (bootstrap.go), independent
	// of ConnectedServerURL - see App.targetServerURL's doc comment.
	TargetServerURL string
	// SandboxKind is the bash-tool sandbox backend the query client's SDK
	// Client actually resolved to at boot - see App.sandboxKind's doc comment.
	SandboxKind string
	// TerminalRelay, when set, is shared with the SDKRuntime constructed in
	// bootstrap.go so a terminal registered via the WS handler here is
	// visible to bash-tool calls made through that runtime. Falls back to a
	// standalone instance (matching prior behavior) when nil, e.g. in tests
	// that construct an App without a full bootstrap.
	TerminalRelay *backendquery.TerminalRelay
	TitleBroker   *backendquery.TitleBroker
}

func NewApp(cfg AppConfig) *App {
	terminalRelay := cfg.TerminalRelay
	if terminalRelay == nil {
		terminalRelay = backendquery.NewTerminalRelay()
	}
	titleBroker := cfg.TitleBroker
	if titleBroker == nil {
		titleBroker = backendquery.NewTitleBroker()
	}
	artifactPreviews := artifactpreview.NewStore()
	// Best-effort periodic cleanup of expired previews - Get() already
	// self-evicts on access, this only matters for entries nobody ever
	// re-requests. No explicit shutdown: this loops for the process's
	// lifetime, same as the app's other daemon-style background work.
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			artifactPreviews.Sweep()
		}
	}()
	return &App{
		oauthStates:           make(map[string]oauthState),
		backend:               cfg.Backend,
		db:                    cfg.DB,
		modelStore:            cfg.ModelStore,
		embedderStore:         cfg.EmbedderStore,
		capabilityLinkStore:   cfg.CapabilityLinkStore,
		providerSettingStore:  cfg.ProviderSettingStore,
		documentReaderStore:   cfg.DocumentReaderStore,
		rerankerStore:         cfg.RerankerStore,
		localSTTStore:         cfg.LocalSTTStore,
		localTitleStore:       cfg.LocalTitleStore,
		sandboxConfigStore:    cfg.SandboxConfigStore,
		storageConfigStore:    cfg.StorageConfigStore,
		longTermExtractor:     cfg.LongTermExtractor,
		rateLimiter:           cfg.RateLimiter,
		loginRateLimiter:      cfg.LoginRateLimiter,
		cloudAutomation:       cfg.CloudAutomation,
		ragService:            cfg.RAGService,
		permBroker:            backendquery.NewPermissionBroker(),
		promptBroker:          backendquery.NewPromptBroker(),
		titleBroker:           titleBroker,
		terminalRelay:         terminalRelay,
		artifactPreviews:      artifactPreviews,
		enableSignup:          cfg.EnableSignup,
		enableAPIKeys:         cfg.EnableAPIKeys,
		featuredRepos:         cfg.FeaturedRepos,
		trustedProxyCIDRs:     cfg.TrustedProxyCIDRs,
		allowedSkillRepoHosts: cfg.AllowedSkillRepoHosts,
		connectedServerURL:    cfg.ConnectedServerURL,
		targetServerURL:       cfg.TargetServerURL,
		sandboxKind:           cfg.SandboxKind,
		transcribeAudio: func(ctx context.Context, apiKey string, audioData []byte, baseURL string) (*sdk.TranscriptionResult, error) {
			if baseURL != "" {
				return sdk.TranscribeAudio(ctx, apiKey, audioData, sdk.WithTranscribeBaseURL(baseURL))
			}
			return sdk.TranscribeAudio(ctx, apiKey, audioData)
		},
	}
}
