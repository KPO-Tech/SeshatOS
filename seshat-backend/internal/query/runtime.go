package query

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/KPO-Tech/seshat/pkg/providers"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"github.com/KPO-Tech/seshat/pkg/types"
	"github.com/KPO-Tech/seshat/pkg/vector"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

type QueryRuntime interface {
	RunPrompt(ctx context.Context, input QueryInput) (*QueryResult, error)
}

type StreamingQueryRuntime interface {
	QueryRuntime
	StreamPrompt(ctx context.Context, input QueryInput, onChunk func(sdk.ResponseChunk), onRuntimeEvent func(sdk.RuntimeEvent)) (*QueryResult, error)
}

type SessionHandle interface {
	GetID() sdk.SessionID
	Close() error
}

type SessionManager interface {
	ListSessions() ([]*sdk.SessionInfo, error)
	CreateSession(ctx context.Context) (SessionHandle, error)
	DeleteSession(sessionID sdk.SessionID) error
}

type TranscriptSearcher interface {
	SearchTranscriptsByContent(needle string, limit int) ([]sdk.SessionID, error)
}

type SessionInterrupter interface {
	InterruptSession(ctx context.Context, sessionID string) error
}

type SessionInspector interface {
	LoadSessionMessages(ctx context.Context, sessionID string) ([]types.Message, error)
}

// SDKRuntime adapts sdk.Client to QueryRuntime + StreamingQueryRuntime + SessionManager.
type SDKRuntime struct {
	client                *sdk.Client
	baseConfig            *sdk.ClientConfig
	terminalRelay         *TerminalRelay
	resolveLocalSTT       func(ctx context.Context) *sdk.SpeechToTextConfig
	resolveBrowser        func(ctx context.Context) string
	resolveBrowserSession func(ctx context.Context, sessionID sdk.SessionID) (string, bool)
	resolveSandboxMode    func(ctx context.Context) (sdk.SandboxKind, bool)
	mu                    sync.RWMutex

	clientCacheMu sync.Mutex
	clientCache   map[clientCacheKey]*cachedRuntimeClient

	ragArtifacts storage.ArtifactStore
	ragVectors   vector.Store
	ragEmbedder  rag.Embedder
	ragChunker   rag.Chunker
	ragCorpora   *db.CorpusStore

	turnMu    sync.Mutex
	busyTurns map[string]struct{}
}

// clientCacheKey identifies the (user, provider, model, credential) identity
// a built *sdk.Client is specific to - the only things clientForInput's
// config-building actually varies per call (see buildClientConfig). Two
// turns that resolve to the same key can safely share one cached client:
// per-session state (the tool allowlist, working-directory prompt text,
// etc.) lives on the *sdk.Session each turn loads fresh, never on the
// client/registry itself - and the one exception that used to (PromptFn /
// WebSearchRunner) is now carried per-turn via context, not mutated on the
// client. See RunPrompt/StreamPrompt's types.WithPromptFn /
// types.WithWebSearchRunner calls.
type clientCacheKey struct {
	userID   string
	provider string
	model    string
	apiKey   string
	baseURL  string
	browser  string
}

// cachedRuntimeClient pairs a cached client with when it was last handed out,
// for TTL-based eviction (see evictExpiredClientsLocked).
type cachedRuntimeClient struct {
	client   *sdk.Client
	lastUsed time.Time
}

// clientCacheTTL bounds how long an idle cached client is kept alive. Long
// enough that a real back-and-forth conversation never pays a rebuild after
// its first turn; short enough that a client nobody's used in a while (a
// closed conversation, a provider setting nobody selects anymore) is
// eventually released instead of accumulating forever - each cached client
// holds real resources (MCP connections, a browser manager, artifact store
// handles) for as long as it's cached.
const clientCacheTTL = 30 * time.Minute

func NewSDKRuntime(client *sdk.Client, baseConfig *sdk.ClientConfig) *SDKRuntime {
	return &SDKRuntime{
		client:      client,
		baseConfig:  cloneClientConfig(baseConfig),
		clientCache: make(map[clientCacheKey]*cachedRuntimeClient),
	}
}

// SetTerminalRelay attaches the shared TerminalRelay used to route a
// session's bash-tool calls through Electron's real terminal when one is
// connected — see applyRemoteExecutor. A separate setter (rather than a
// constructor param) keeps NewSDKRuntime's existing call sites, including
// runtime_test.go, unchanged.
func (r *SDKRuntime) SetTerminalRelay(relay *TerminalRelay) {
	r.terminalRelay = relay
}

// SetLocalSTTResolver attaches a resolver for a locally running whisper.cpp
// server (see api.handleLocalSTTConfig, set by the Electron main process
// once it has spawned whisper-server) — when it returns non-nil, it takes
// priority over the SpeechToText baked into baseConfig at bootstrap, so the
// agent's own speech_to_text tool tracks whichever server the manual
// dictation endpoint (POST /api/v1/transcribe) already prefers, without
// needing a backend restart when the setting changes. A separate setter
// (rather than a constructor param) keeps NewSDKRuntime's existing call
// sites, including runtime_test.go, unchanged — same reasoning as
// SetTerminalRelay above.
func (r *SDKRuntime) SetLocalSTTResolver(resolve func(ctx context.Context) *sdk.SpeechToTextConfig) {
	r.resolveLocalSTT = resolve
}

// SetSandboxModeResolver attaches the per-request resolver for Settings >
// Environment's Docker-vs-local bash sandbox choice (see
// db.SandboxConfigStore). The resolver returns ok=false only on a genuine
// read error - "no choice saved yet" is resolved to SandboxKindLocal inside
// the resolver itself (the desktop default), not signaled as ok=false, so a
// fresh install gets direct host access without needing the fallback path
// below to hide that default. ok=false keeps baseConfig's own SandboxKind
// (set at bootstrap) as a safety net.
func (r *SDKRuntime) SetSandboxModeResolver(resolve func(ctx context.Context) (sdk.SandboxKind, bool)) {
	r.mu.Lock()
	r.resolveSandboxMode = resolve
	r.mu.Unlock()
}

func (r *SDKRuntime) SetBrowserRemoteControlResolver(resolve func(ctx context.Context) string) {
	r.mu.Lock()
	r.resolveBrowser = resolve
	r.mu.Unlock()
}

// SetBrowserSessionTargetResolver attaches the per-session resolver that lets
// a session's browser tool calls attach to an existing, desktop-visible CDP
// tab instead of an invisible incognito one - see
// sdk.ClientConfig.BrowserSessionTargetResolver for the full rationale. Same
// setter-not-constructor-param reasoning as SetTerminalRelay above.
func (r *SDKRuntime) SetBrowserSessionTargetResolver(resolve func(ctx context.Context, sessionID sdk.SessionID) (string, bool)) {
	r.mu.Lock()
	r.resolveBrowserSession = resolve
	r.mu.Unlock()
}

// SetRAGComponents attaches the raw components needed to build a
// per-request, per-caller-scoped RAGService, closing a cross-user
// data-read gap: baseConfig.RAGService (when set) is a single *rag.Service
// shared by every user this backend serves, and its rag_search tool takes
// corpus_id as a plain model-supplied string with no ownership check - see
// userScopedVectorStore's doc comment for the full rationale. Once set,
// clientForInput builds a fresh RAGService per request scoped to
// input.RAGAllowedOwnerIDs instead of reusing the shared, unscoped one. Not
// calling this (e.g. in tests, or when RAG isn't configured at all) leaves
// baseConfig.RAGService as-is, matching behavior before this fix.
func (r *SDKRuntime) SetRAGComponents(artifacts storage.ArtifactStore, vectors vector.Store, embedder rag.Embedder, chunker rag.Chunker, corpora *db.CorpusStore) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ragArtifacts = artifacts
	r.ragVectors = vectors
	r.ragEmbedder = embedder
	r.ragChunker = chunker
	r.ragCorpora = corpora
}

// tryAcquireSessionTurn ensures at most one RunPrompt/StreamPrompt call runs
// at a time for a given session_id. clientForInput may return a cached
// *sdk.Client, but loadOrCreateSession still rehydrates the *sdk.Session
// fresh from the persisted store on every call - so two concurrent
// requests for the same session_id get two independent in-memory Session
// objects backed by the same persisted transcript, and whichever one saves
// back last silently clobbers the other turn's messages. Fails fast rather
// than queuing, mirroring the engine's own "session busy" semantics. An
// empty sessionID (the very first turn of a brand-new session) is never
// contended and always succeeds.
func (r *SDKRuntime) tryAcquireSessionTurn(sessionID string) (release func(), ok bool) {
	if sessionID == "" {
		return func() {}, true
	}
	r.turnMu.Lock()
	defer r.turnMu.Unlock()
	if r.busyTurns == nil {
		r.busyTurns = make(map[string]struct{})
	}
	if _, busy := r.busyTurns[sessionID]; busy {
		return nil, false
	}
	r.busyTurns[sessionID] = struct{}{}
	return func() {
		r.turnMu.Lock()
		delete(r.busyTurns, sessionID)
		r.turnMu.Unlock()
	}, true
}

// applyRemoteExecutor registers a terminalRemoteExecutor for session when
// Electron's terminal relay has a live connection for it, so this turn's
// bash-tool calls run in the user's real, visible shell. Sessions with no
// terminal ever opened are unaffected — bash.Tool falls back to local
// execution exactly as before.
func (r *SDKRuntime) applyRemoteExecutor(session *sdk.Session, sessionID string) {
	if r.terminalRelay == nil || sessionID == "" {
		return
	}
	if !r.terminalRelay.Available(sessionID) {
		session.ClearRemoteExecutor()
		return
	}
	session.SetRemoteExecutor(&terminalRemoteExecutor{relay: r.terminalRelay, sessionID: sessionID})
}

func (r *SDKRuntime) RunPrompt(ctx context.Context, input QueryInput) (*QueryResult, error) {
	release, ok := r.tryAcquireSessionTurn(input.SessionID)
	if !ok {
		return nil, bkerr.Conflict("a turn is already in progress for this session", nil)
	}
	defer release()

	client, releaseClient, err := r.clientForInput(ctx, input)
	if err != nil {
		return nil, err
	}
	defer releaseClient()
	session, err := r.loadOrCreateSession(ctx, client, input.SessionID, input.ExecutionOrigin)
	if err != nil {
		return nil, err
	}
	r.applyRemoteExecutor(session, session.GetID().String())
	applyToolAllowlist(session, input.AllowedTools)

	// See the matching comment in StreamPrompt: carried on ctx, not
	// client.SetWebSearchRunner, so a cached/reused client can't have one
	// turn's search routing overwritten by another's.
	if input.WebSearchRunner != nil {
		ctx = types.WithWebSearchRunner(ctx, input.WebSearchRunner)
	}
	if input.PermissionMode != "" {
		session.SetPermissionMode(input.PermissionMode)
	}
	applyForcedExecutionMode(session, input.ForcedExecutionMode)
	if cwd := effectiveCWD(input); cwd != "" {
		session.SetWorkingDirectory(cwd)
	}
	if input.SystemPromptOverride != nil {
		session.SetSystemPromptTemplate(*input.SystemPromptOverride)
	} else {
		session.SetSystemPromptTemplate("")
	}
	appendPrompt := effectiveAppendSystemPrompt(input)
	session.SetAppendSystemPrompt(appendPrompt)

	response, err := submitQueryMessage(ctx, session, input)
	if err != nil {
		return nil, fmt.Errorf("submit message: %w", err)
	}
	return sessionResponseToResult(session, response), nil
}

func (r *SDKRuntime) StreamPrompt(ctx context.Context, input QueryInput, onChunk func(sdk.ResponseChunk), onRuntimeEvent func(sdk.RuntimeEvent)) (*QueryResult, error) {
	release, ok := r.tryAcquireSessionTurn(input.SessionID)
	if !ok {
		return nil, bkerr.Conflict("a turn is already in progress for this session", nil)
	}
	defer release()

	// perf: turnStart anchors every timing below to "the moment seshat-backend
	// started building the SDK client for this turn" - the dominant suspect
	// for perceived slowness is clientMs, since sdk.NewClient rebuilds the
	// whole tool registry and re-synchronizes every configured MCP server
	// (one at a time, no cache) on EVERY turn, not once per session. See
	// docs/produits/chat/seshatos-main-chat-ui-audit.md.
	turnStart := time.Now()

	// Stage events give the client something concrete to show during the
	// otherwise-silent gap before the first response chunk - reusing the
	// same phase boundaries the [perf] timings above already measure, so
	// there's no separate profiling to keep in sync.
	emitStage := func(stage, label string) {
		onRuntimeEvent(sdk.RuntimeEvent{
			Type:       sdk.RuntimeEventTypeStage,
			SessionID:  sdk.SessionID(input.SessionID),
			StageEvent: &sdk.StageRuntimeEvent{Stage: stage, Label: label},
		})
	}

	emitStage("tools", "Loading tools & connections")
	clientStart := time.Now()
	client, releaseClient, err := r.clientForInput(ctx, input)
	if err != nil {
		return nil, err
	}
	clientMs := time.Since(clientStart).Milliseconds()
	defer releaseClient()

	emitStage("session", "Resuming session")
	sessionStart := time.Now()
	session, err := r.loadOrCreateSession(ctx, client, input.SessionID, input.ExecutionOrigin)
	if err != nil {
		return nil, err
	}
	sessionLoadMs := time.Since(sessionStart).Milliseconds()
	r.applyRemoteExecutor(session, session.GetID().String())
	applyToolAllowlist(session, input.AllowedTools)

	// Carried on ctx (not client.SetPromptFn/SetWebSearchRunner, which mutate
	// state shared by every session built from this *sdk.Client) so a client
	// reused across concurrent turns - see clientForInput's cache - can't
	// have one turn's prompt/search routing overwritten or cleared by
	// another's. See types.WithPromptFn's doc comment for the full story.
	if input.PromptFn != nil {
		ctx = types.WithPromptFn(ctx, input.PromptFn)
	}
	if input.WebSearchRunner != nil {
		ctx = types.WithWebSearchRunner(ctx, input.WebSearchRunner)
	}
	if input.PermissionMode != "" {
		session.SetPermissionMode(input.PermissionMode)
	}
	applyForcedExecutionMode(session, input.ForcedExecutionMode)
	if cwd := effectiveCWD(input); cwd != "" {
		session.SetWorkingDirectory(cwd)
	}
	if input.SystemPromptOverride != nil {
		session.SetSystemPromptTemplate(*input.SystemPromptOverride)
	} else {
		session.SetSystemPromptTemplate("")
	}
	session.SetAppendSystemPrompt(effectiveAppendSystemPrompt(input))

	// perf: capture wall-clock time (from turnStart, i.e. including client
	// rebuild + session load) to the first visible sign of life, whichever
	// comes first - a runtime event (tool call, thinking, permission prompt)
	// or a response chunk (text token). Only the first occurrence of each is
	// timed; onceFirstTrace/onceFirstChunk guard against re-timing every
	// subsequent event in a turn with many tool calls.
	var onceFirstTrace, onceFirstChunk sync.Once
	var firstTraceMs, firstChunkMs int64
	var chunkCount, chunkBytes, largestChunkBytes, largestChunkGapMs int64
	var previousChunkAt time.Time
	wrappedOnRuntimeEvent := func(event sdk.RuntimeEvent) {
		onceFirstTrace.Do(func() { firstTraceMs = time.Since(turnStart).Milliseconds() })
		onRuntimeEvent(event)
	}
	wrappedOnChunk := func(chunk sdk.ResponseChunk) {
		now := time.Now()
		onceFirstChunk.Do(func() { firstChunkMs = now.Sub(turnStart).Milliseconds() })
		chunkSize := int64(len(chunk.Delta) + len(chunk.PartialJSON))
		chunkCount++
		chunkBytes += chunkSize
		if chunkSize > largestChunkBytes {
			largestChunkBytes = chunkSize
		}
		if !previousChunkAt.IsZero() {
			gap := now.Sub(previousChunkAt).Milliseconds()
			if gap > largestChunkGapMs {
				largestChunkGapMs = gap
			}
		}
		previousChunkAt = now
		onChunk(chunk)
	}

	session.SetResponseChunkFn(wrappedOnChunk)
	defer session.SetResponseChunkFn(nil)
	session.SetRuntimeEventFn(wrappedOnRuntimeEvent)
	defer session.SetRuntimeEventFn(nil)

	response, err := submitQueryMessage(ctx, session, input)
	totalMs := time.Since(turnStart).Milliseconds()
	log.Printf("[perf] stream_prompt session=%s client_build_ms=%d session_load_ms=%d time_to_first_trace_ms=%d time_to_first_chunk_ms=%d chunk_count=%d chunk_bytes=%d largest_chunk_bytes=%d largest_chunk_gap_ms=%d total_ms=%d",
		session.GetID(), clientMs, sessionLoadMs, firstTraceMs, firstChunkMs, chunkCount, chunkBytes, largestChunkBytes, largestChunkGapMs, totalMs)
	if err != nil {
		return nil, fmt.Errorf("submit message: %w", err)
	}
	return sessionResponseToResult(session, response), nil
}

// applyForcedExecutionMode pushes a session into (or out of) plan mode ahead
// of a turn based on the host-set override read from the session's ownership
// record — a no-op unless it actually needs to change anything, so calling it
// unconditionally on every turn is cheap and idempotent.
// applyToolAllowlist prunes a session down to exactly input.AllowedTools
// when the active agent definition specifies one. Unregistering is the
// only primitive available (there's no bulk "restore to global default"
// call), so once a session is narrowed it stays narrowed for its
// lifetime - acceptable today since agent selection happens once per
// conversation, not mid-conversation, but worth knowing if that changes.
// Calling this unconditionally on every turn is cheap and idempotent, same
// as applyForcedExecutionMode below.
func applyToolAllowlist(session *sdk.Session, allowed []string) {
	if len(allowed) == 0 {
		return
	}
	keep := make(map[string]bool, len(allowed))
	for _, name := range allowed {
		keep[name] = true
	}
	for _, name := range session.GetToolNames() {
		if !keep[name] {
			_ = session.UnregisterTool(name)
		}
	}
}

func applyForcedExecutionMode(session *sdk.Session, forced string) {
	switch forced {
	case "plan":
		if session.GetExecutionMode() != sdk.ExecutionModePlan {
			session.ForcePlanMode()
		}
	case "execute":
		if session.GetExecutionMode() == sdk.ExecutionModePlan {
			session.ClearPlanMode()
		}
	}
}

// submitQueryMessage calls SubmitMessageWithContent when image attachments are present,
// falling back to plain SubmitMessage for text-only turns.
func submitQueryMessage(ctx context.Context, session *sdk.Session, input QueryInput) (*sdk.SessionResponse, error) {
	if len(input.Images) == 0 {
		return session.SubmitMessage(ctx, input.Prompt)
	}
	imgs := make([]types.ImageContent, 0, len(input.Images))
	for _, img := range input.Images {
		var ic types.ImageContent
		ic.Source.Type = "base64"
		ic.Source.MediaType = img.MediaType
		ic.Source.Data = img.Data
		imgs = append(imgs, ic)
	}
	return session.SubmitMessageWithContent(ctx, input.Prompt, imgs)
}

// effectiveCWD returns the directory the agent should use as its working directory.
// The project path takes priority over the workspace when set.
func effectiveCWD(input QueryInput) string {
	if pp := strings.TrimSpace(input.ProjectPath); pp != "" {
		return pp
	}
	return strings.TrimSpace(input.WorkspacePath)
}

func effectiveAppendSystemPrompt(input QueryInput) string {
	var contextBlock strings.Builder

	wsPath := strings.TrimSpace(input.WorkspacePath)
	pp := strings.TrimSpace(input.ProjectPath)

	if wsPath != "" {
		contextBlock.WriteString(fmt.Sprintf("Your session workspace is: %s\n", wsPath))
		contextBlock.WriteString("  - Uploaded files land in: uploads/ (images/, documents/, other/)\n")
		contextBlock.WriteString("  - Plan artifacts land in: plans/\n")
		contextBlock.WriteString("  - You can read/write freely in this directory.\n")
	}
	if pp != "" {
		contextBlock.WriteString(fmt.Sprintf("\nYour active project directory is: %s\n", pp))
		contextBlock.WriteString("  - This is your working directory for the current session.\n")
		contextBlock.WriteString("  - Use it as the base for all project file operations.\n")
	} else if wsPath != "" {
		contextBlock.WriteString(fmt.Sprintf("\nYour working directory is: %s\n", wsPath))
		contextBlock.WriteString("  - All file operations are scoped to this directory.\n")
	}

	block := strings.TrimSpace(contextBlock.String())
	base := ""
	if input.AppendSystemPrompt != nil {
		base = strings.TrimSpace(*input.AppendSystemPrompt)
	}
	if block == "" {
		return base
	}
	if base == "" {
		return block
	}
	return base + "\n\n" + block
}

func (r *SDKRuntime) ListSessions() ([]*sdk.SessionInfo, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	return r.client.ListSessions()
}

func (r *SDKRuntime) SearchTranscriptsByContent(needle string, limit int) ([]sdk.SessionID, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	return r.client.SearchTranscriptsByContent(needle, limit)
}

func (r *SDKRuntime) CreateSession(ctx context.Context) (SessionHandle, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	return r.client.CreateSession(ctx)
}

func (r *SDKRuntime) DeleteSession(sessionID sdk.SessionID) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("session store not available")
	}
	return r.client.DeleteSession(sessionID)
}

// ReloadMCPServers hot-reloads MCP server integrations on the base client.
func (r *SDKRuntime) ReloadMCPServers(ctx context.Context, servers []sdk.MCPServerConfig) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("runtime not configured")
	}
	if err := r.client.ReloadMCPServers(ctx, servers); err != nil {
		return err
	}
	r.mu.Lock()
	if r.baseConfig == nil {
		r.baseConfig = sdk.DefaultClientConfig()
	}
	r.baseConfig.MCPServers = append([]sdk.MCPServerConfig(nil), servers...)
	r.mu.Unlock()
	// Every cached per-turn client was built from the base config's previous
	// MCP set - now stale, so the clients themselves are too.
	r.invalidateClientCache()
	return nil
}

// ReloadPreToolHooks hot-reloads the shell pre-tool hook set on the base
// client (see sdk.Client.ReloadPreToolHooks) and also updates baseConfig so
// any future per-request/provider client built via buildBaseClientConfig
// (which only ever reads PreToolHooks once, at its own sdk.NewClient call)
// picks up the same set - mirrors ReloadMCPServers' own two-part update
// exactly.
func (r *SDKRuntime) ReloadPreToolHooks(hooks []sdk.PreToolHookConfig) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("runtime not configured")
	}
	if err := r.client.ReloadPreToolHooks(hooks); err != nil {
		return err
	}
	r.mu.Lock()
	if r.baseConfig == nil {
		r.baseConfig = sdk.DefaultClientConfig()
	}
	r.baseConfig.PreToolHooks = append([]sdk.PreToolHookConfig(nil), hooks...)
	r.mu.Unlock()
	// See ReloadMCPServers' matching call - same staleness reasoning.
	r.invalidateClientCache()
	return nil
}

// MCPResult returns the current MCP integration result from the base client.
func (r *SDKRuntime) MCPResult() *sdk.MCPIntegrationResult {
	if r == nil || r.client == nil {
		return nil
	}
	return r.client.MCPResult()
}

func (r *SDKRuntime) InterruptSession(ctx context.Context, sessionID string) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("session store not available")
	}
	session, err := r.client.LoadSession(ctx, sdk.SessionID(sessionID))
	if err != nil {
		return fmt.Errorf("load session: %w", err)
	}
	return session.Interrupt()
}

func (r *SDKRuntime) LoadSessionMessages(ctx context.Context, sessionID string) ([]types.Message, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	session, err := r.client.LoadSession(ctx, sdk.SessionID(sessionID))
	if err != nil {
		return nil, fmt.Errorf("load session: %w", err)
	}
	return session.GetMessages(), nil
}

func (r *SDKRuntime) loadOrCreateSession(ctx context.Context, client *sdk.Client, sessionID string, origin types.ExecutionOrigin) (*sdk.Session, error) {
	if client == nil {
		return nil, fmt.Errorf("query runtime not configured")
	}
	var additional map[string]any
	if origin == types.ExecutionOriginSkillAgent {
		additional = map[string]any{"tool_surface_profile": "skill_agent"}
	}
	if strings.TrimSpace(sessionID) != "" {
		session, err := client.LoadSessionWithAdditional(ctx, sdk.SessionID(sessionID), additional)
		if err != nil {
			return nil, fmt.Errorf("load session: %w", err)
		}
		return session, nil
	}
	session, err := client.CreateSessionWithAdditional(ctx, additional)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

func (r *SDKRuntime) clientForInput(ctx context.Context, input QueryInput) (*sdk.Client, func(), error) {
	if r == nil || r.client == nil {
		return nil, nil, fmt.Errorf("query runtime not configured")
	}

	cfg := r.buildBaseClientConfig(ctx)
	if input.RuntimeProvider != nil {
		cfg = r.buildClientConfig(ctx, *input.RuntimeProvider)
	}
	cfg.UserID = input.UserID

	r.mu.RLock()
	ragArtifacts, ragVectors, ragEmbedder, ragChunker, ragCorpora := r.ragArtifacts, r.ragVectors, r.ragEmbedder, r.ragChunker, r.ragCorpora
	r.mu.RUnlock()
	if ragVectors != nil && ragCorpora != nil && len(input.RAGAllowedOwnerIDs) > 0 {
		cfg.RAGService = rag.NewService(ragArtifacts, newUserScopedVectorStore(ragVectors, ragCorpora, input.RAGAllowedOwnerIDs), ragEmbedder, ragChunker)
	}

	key := clientCacheKey{
		userID:   input.UserID,
		provider: string(cfg.Model.Provider),
		model:    cfg.Model.Model,
		apiKey:   cfg.APIKey,
		browser:  strings.TrimSpace(cfg.BrowserRemoteControlURL),
	}
	if cfg.ProviderConfig != nil {
		key.baseURL = cfg.ProviderConfig.BaseURL
	}

	r.clientCacheMu.Lock()
	r.evictExpiredClientsLocked()
	if cached, ok := r.clientCache[key]; ok {
		cached.lastUsed = time.Now()
		r.clientCacheMu.Unlock()
		return cached.client, func() {}, nil
	}
	r.clientCacheMu.Unlock()

	client, err := sdk.NewClient(cfg)
	if err != nil {
		if input.RuntimeProvider != nil {
			return nil, nil, fmt.Errorf("create provider runtime client: %w", err)
		}
		return nil, nil, fmt.Errorf("create request runtime client: %w", err)
	}

	r.clientCacheMu.Lock()
	if r.clientCache == nil {
		r.clientCache = make(map[clientCacheKey]*cachedRuntimeClient)
	}
	r.clientCache[key] = &cachedRuntimeClient{client: client, lastUsed: time.Now()}
	r.clientCacheMu.Unlock()

	return client, func() {}, nil
}

// evictExpiredClientsLocked closes and drops every cached client idle for
// longer than clientCacheTTL. Callers must hold clientCacheMu.
func (r *SDKRuntime) evictExpiredClientsLocked() {
	if len(r.clientCache) == 0 {
		return
	}
	now := time.Now()
	for key, entry := range r.clientCache {
		if now.Sub(entry.lastUsed) > clientCacheTTL {
			_ = entry.client.Close()
			delete(r.clientCache, key)
		}
	}
}

// invalidateClientCache closes and drops every cached client. Called
// whenever the base config those clients were built from changes underneath
// them (ReloadMCPServers, ReloadPreToolHooks) - a cached client only reflects
// the config snapshot it was built with, so once that snapshot is stale the
// whole cache is.
func (r *SDKRuntime) invalidateClientCache() {
	r.clientCacheMu.Lock()
	defer r.clientCacheMu.Unlock()
	for key, entry := range r.clientCache {
		_ = entry.client.Close()
		delete(r.clientCache, key)
	}
}

// CloseCachedClients closes every cached per-turn client. Call once at
// process shutdown, alongside the base client's own Close() - see
// bootstrap.go's cleanups chain.
func (r *SDKRuntime) CloseCachedClients() {
	if r == nil {
		return
	}
	r.invalidateClientCache()
}

func (r *SDKRuntime) buildBaseClientConfig(ctx context.Context) *sdk.ClientConfig {
	r.mu.RLock()
	cfg := cloneClientConfig(r.baseConfig)
	resolveLocalSTT := r.resolveLocalSTT
	resolveBrowser := r.resolveBrowser
	resolveBrowserSession := r.resolveBrowserSession
	resolveSandboxMode := r.resolveSandboxMode
	r.mu.RUnlock()
	if cfg == nil {
		cfg = sdk.DefaultClientConfig()
	}
	if strings.TrimSpace(cfg.BrowserRemoteControlURL) == "" && resolveBrowser != nil {
		cfg.BrowserRemoteControlURL = strings.TrimSpace(resolveBrowser(ctx))
	}
	if resolveBrowserSession != nil {
		cfg.BrowserSessionTargetResolver = resolveBrowserSession
	}
	if resolveSandboxMode != nil {
		if kind, ok := resolveSandboxMode(ctx); ok {
			cfg.SandboxKind = kind
		}
	}
	cfg.SessionStore = r.client.GetSessionStore()
	cfg.ArtifactStore = r.client.GetArtifactStore()
	cfg.Monitoring = r.client.GetMonitoring()
	if resolveLocalSTT != nil {
		if localSTT := resolveLocalSTT(ctx); localSTT != nil {
			cfg.SpeechToText = localSTT
		}
	}
	return cfg
}

func (r *SDKRuntime) buildClientConfig(ctx context.Context, providerCfg RuntimeProviderConfig) *sdk.ClientConfig {
	cfg := r.buildBaseClientConfig(ctx)

	modelID := strings.TrimSpace(providerCfg.ModelID)
	if modelID == "" {
		if cfg.Model.Provider == types.APIProvider(providerCfg.Provider) {
			modelID = cfg.Model.Model
		}
	}
	provider := types.APIProvider(providerCfg.Provider)
	providerConfig := providers.GetProviderConfig(provider)
	if providerConfig == nil {
		providerConfig = &providers.Config{Provider: provider}
	}
	providerConfig.Provider = provider
	providerConfig.APIKey = providerCfg.Secret
	if strings.TrimSpace(providerCfg.BaseURL) != "" {
		providerConfig.BaseURL = strings.TrimSpace(providerCfg.BaseURL)
	}

	cfg.APIKey = providerCfg.Secret
	cfg.Model = sdk.ModelIdentifier{Provider: provider, Model: modelID}
	cfg.ProviderConfig = providerConfig
	cfg.MaxTokens = InteractiveMaxTokensForModel(cfg.Model)
	return cfg
}

// InteractiveMaxTokensForModel returns the model's generated-output budget. It
// prefers the provider catalog when available, then falls back to the runtime's
// public context-window registry for custom or provider-resolved model names.
func InteractiveMaxTokensForModel(model sdk.ModelIdentifier) int {
	if info, ok := providers.GetModelInfo(model.Provider, model.Model); ok && info.MaxOutput > 0 {
		return info.MaxOutput
	}
	if window := types.GetContextWindow(types.ModelIdentifier(model)); window.MaxOutputTokens > 0 {
		return window.MaxOutputTokens
	}
	return 4096
}

func cloneClientConfig(src *sdk.ClientConfig) *sdk.ClientConfig {
	if src == nil {
		return nil
	}
	cloned := *src
	if src.MCPServers != nil {
		cloned.MCPServers = append([]sdk.MCPServerConfig(nil), src.MCPServers...)
	}
	if src.StorageGCNamespaces != nil {
		cloned.StorageGCNamespaces = append([]string(nil), src.StorageGCNamespaces...)
	}
	if src.StopHooks != nil {
		cloned.StopHooks = append([]sdk.StopHook(nil), src.StopHooks...)
	}
	// CredentialResolver is an interface (pointer-like): shallow copy is correct.
	cloned.CredentialResolver = src.CredentialResolver
	return &cloned
}

func sessionResponseToResult(session *sdk.Session, response *sdk.SessionResponse) *QueryResult {
	return &QueryResult{
		SessionID:   session.GetID().String(),
		Content:     responseText(response.Messages),
		StopReason:  response.StopReason,
		TurnNumber:  response.TurnNumber,
		IsComplete:  response.IsComplete,
		Usage:       response.Usage,
		ToolUses:    response.ToolUses,
		ToolResults: response.ToolResults,
		Messages:    append([]types.Message(nil), response.Messages...),
	}
}

func responseText(messages []types.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != types.RoleAssistant {
			continue
		}
		var text strings.Builder
		for _, block := range messages[i].Content {
			if textBlock, ok := block.(types.TextContent); ok {
				text.WriteString(textBlock.Text)
			}
		}
		if text.Len() > 0 {
			return text.String()
		}
	}
	return ""
}

func (r *SDKRuntime) UpdateSessionPermissionMode(ctx context.Context, sessionID string, mode types.PermissionMode) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("session store not available")
	}
	session, err := r.client.LoadSession(ctx, sdk.SessionID(sessionID))
	if err != nil {
		return fmt.Errorf("load session: %w", err)
	}
	session.SetPermissionMode(sdk.PermissionMode(mode))
	return nil
}
