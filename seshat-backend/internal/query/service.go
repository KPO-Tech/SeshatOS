package query

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
	"unicode"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendfiles "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/files"
	backendknowledge "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	backendmemories "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/memories"
	backendprompt "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/prompt"
	bksettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	bkwebsearch "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/websearch"
	"github.com/KPO-Tech/seshat/pkg/agent"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/sdk"
	"github.com/KPO-Tech/seshat/pkg/types"
	webcore "github.com/KPO-Tech/seshat/pkg/web"
	"github.com/KPO-Tech/seshat/pkg/workspace"
)

type Service struct {
	runtime     QueryRuntime
	sessions    SessionManager
	ownership   *db.SessionOwnershipStore // nil = unscoped mode (headless / tests)
	settings    providerRuntimeResolver
	webSearch   webSearchProvider   // nil = use env-based fallback
	memories    memoriesProvider    // nil = memories feature disabled
	preferences preferencesProvider // nil = preferences feature disabled
	knowledge   knowledgeProvider   // nil = RAG feature disabled
	files       filesProvider       // nil = attachments feature disabled
	skills      skillsProvider      // nil = skills feature disabled
	agents      agentsProvider      // nil = only built-in agents available
}

// agentsProvider resolves an agent definition by slug (local DB, then — in
// connected mode — the caller's organization catalog, then the SDK built-in
// registry). Implemented by *agents.Service (internal/agents); the
// interface lives here to avoid an import cycle.
type agentsProvider interface {
	GetDefinition(ctx context.Context, principal *backendauth.Principal, slug string) (*agent.AgentDefinition, bool)
}

// ─── internal service dependency interfaces ───────────────────────────────────

type providerRuntimeResolver interface {
	ResolveRuntimeConfig(ctx context.Context, principal *backendauth.Principal, id string) (*bksettings.ResolvedProviderConfig, error)
}

type memoriesProvider interface {
	List(ctx context.Context, principal *backendauth.Principal) ([]backendmemories.UserMemory, error)
	BuildContextBlock(ctx context.Context, principal *backendauth.Principal, prompt string) (string, error)
}

type preferencesProvider interface {
	BuildSystemPromptBlock(ctx context.Context, principal *backendauth.Principal) (string, error)
	ResolvePermissionModes(ctx context.Context, principal *backendauth.Principal, origin types.ExecutionOrigin) (types.PermissionMode, error)
}

type knowledgeProvider interface {
	Search(ctx context.Context, principal *backendauth.Principal, params backendknowledge.SearchParams) (*rag.SearchResponse, error)
}

type filesProvider interface {
	GetFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*backendfiles.File, error)
	DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) ([]byte, *backendfiles.File, error)
	AttachToMessage(ctx context.Context, fileIDs []string, sessionID string, messageIndex int) error
	ListMessageAttachments(ctx context.Context, sessionID string) ([]backendfiles.File, error)
	// DeleteBySessionID removes every file record + blob for a session,
	// sent-message-attached or not - see DeleteSession/SweepAbandonedSessions.
	DeleteBySessionID(ctx context.Context, sessionID string) error
}

type skillsProvider interface {
	ResolvePrompt(ctx context.Context, userID, prompt string) string
}

// ─── ServiceConfig ─────────────────────────────────────────────────────────────

// ServiceConfig holds all dependencies for the query service. Optional fields
// (Memories, Preferences, Knowledge, Files, Skills) may be nil to disable the
// corresponding feature.
type ServiceConfig struct {
	Runtime     QueryRuntime
	Sessions    SessionManager
	Ownership   *db.SessionOwnershipStore
	Settings    providerRuntimeResolver
	WebSearch   webSearchProvider
	Memories    memoriesProvider
	Preferences preferencesProvider
	Knowledge   knowledgeProvider
	Files       filesProvider
	Skills      skillsProvider
	Agents      agentsProvider // nil = only built-in agents
}

// defaultProviderResolver is an optional extension of providerRuntimeResolver.
// If the concrete settings service implements it, the query service will
// automatically fall back to the user's default provider when no
// provider_setting_id is specified in the request.
type defaultProviderResolver interface {
	ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*bksettings.ResolvedProviderConfig, error)
}

// webSearchProvider is implemented by the backend websearch service.
// Nil means no DB-backed provider — the tool falls back to env vars.
type webSearchProvider interface {
	Search(ctx context.Context, principal *backendauth.Principal, params bkwebsearch.SearchParams) (*bkwebsearch.SearchResponse, error)
}

func NewService(cfg ServiceConfig) *Service {
	return &Service{
		runtime:     cfg.Runtime,
		sessions:    cfg.Sessions,
		ownership:   cfg.Ownership,
		settings:    cfg.Settings,
		webSearch:   cfg.WebSearch,
		memories:    cfg.Memories,
		preferences: cfg.Preferences,
		knowledge:   cfg.Knowledge,
		files:       cfg.Files,
		skills:      cfg.Skills,
		agents:      cfg.Agents,
	}
}

func (s *Service) SupportsStreaming() bool {
	if s == nil || s.runtime == nil {
		return false
	}
	_, ok := s.runtime.(StreamingQueryRuntime)
	return ok
}

// RunPrompt runs a single prompt turn, enforcing session ownership when the
// ownership store is configured and a session_id is provided.
// If session_id is empty and ownership is configured, an ownership record is
// created for the newly created runtime session (best-effort).
func (s *Service) RunPrompt(ctx context.Context, principal *backendauth.Principal, input QueryInput) (*QueryResult, error) {
	if s == nil || s.runtime == nil {
		return nil, bkerr.Unavailable("query runtime not configured", nil)
	}
	if strings.TrimSpace(input.Prompt) == "" {
		return nil, bkerr.InvalidInput("prompt is required", nil)
	}

	if err := s.checkSessionAccess(ctx, principal, input.SessionID); err != nil {
		return nil, err
	}

	runtimeInput, bindAfterRun, err := s.prepareRuntimeInput(ctx, principal, input)
	if err != nil {
		return nil, err
	}

	result, err := s.runtime.RunPrompt(ctx, runtimeInput)
	if err != nil {
		return nil, bkerr.WrapOrInternal(err)
	}

	s.trackSessionBinding(ctx, principal, input.SessionID, result.SessionID, bindAfterRun, input.PermissionMode, input.ExecutionOrigin)
	return result, nil
}

// StreamPrompt is the streaming variant of RunPrompt.
func (s *Service) StreamPrompt(ctx context.Context, principal *backendauth.Principal, input QueryInput, onChunk func(sdk.ResponseChunk), onRuntimeEvent func(sdk.RuntimeEvent)) (*QueryResult, error) {
	if s == nil || s.runtime == nil {
		return nil, bkerr.Unavailable("query runtime not configured", nil)
	}
	if strings.TrimSpace(input.Prompt) == "" {
		return nil, bkerr.InvalidInput("prompt is required", nil)
	}
	streamer, ok := s.runtime.(StreamingQueryRuntime)
	if !ok {
		return nil, bkerr.Unavailable("streaming not supported by this runtime", nil)
	}

	if err := s.checkSessionAccess(ctx, principal, input.SessionID); err != nil {
		return nil, err
	}

	runtimeInput, bindAfterRun, err := s.prepareRuntimeInput(ctx, principal, input)
	if err != nil {
		return nil, err
	}

	result, err := streamer.StreamPrompt(ctx, runtimeInput, onChunk, onRuntimeEvent)
	if err != nil {
		return nil, bkerr.WrapOrInternal(err)
	}

	s.trackSessionBinding(ctx, principal, input.SessionID, result.SessionID, bindAfterRun, input.PermissionMode, input.ExecutionOrigin)
	return result, nil
}

// ListSessions returns sessions visible to the principal.
//   - ownership nil: returns all runtime sessions (unscoped / headless mode)
//   - ownership configured: returns only sessions owned by the principal
func (s *Service) ListSessions(ctx context.Context, principal *backendauth.Principal) ([]SessionInfo, error) {
	if s == nil {
		return nil, bkerr.Unavailable("query service not configured", nil)
	}

	// Unscoped mode: fall back to raw runtime list (no ownership info)
	if s.ownership == nil {
		return s.listSessionsUnscoped()
	}

	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	owned, err := s.ownership.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("list sessions: "+err.Error(), err)
	}

	// Build a runtime info map for enrichment (best-effort, nil sessions is fine)
	runtimeMap := s.runtimeSessionMap()

	result := make([]SessionInfo, 0, len(owned))
	for _, o := range owned {
		info := SessionInfo{
			SessionID:         o.SessionID,
			UserID:            o.UserID,
			ProviderSettingID: o.ProviderSettingID,
			ModelID:           o.ModelID,
			WorkspaceID:       o.WorkspaceID,
			OrganizationID:    o.OrganizationID,
			Title:             o.Title,
			PermissionMode:    o.PermissionMode,
			ExecutionOrigin:   o.ExecutionOrigin,
			ExecutionMode:     o.ForcedExecutionMode,
			Source:            o.Source,
			WorkspacePath:     o.WorkspacePath,
			ProjectPath:       o.ProjectPath,
			CreatedAt:         o.CreatedAt.Unix(),
			UpdatedAt:         o.UpdatedAt.Unix(),
		}
		if ri, ok := runtimeMap[o.SessionID]; ok {
			info.Status = string(ri.Status)
			info.TotalTurns = ri.TotalTurns
			info.TotalTokens = ri.TotalTokens
		}
		result = append(result, info)
	}
	return result, nil
}

// SearchSessionsByTitle returns sessions whose title contains needle, using a single
// DB-level LIKE query. This avoids the N+1 incurred by ListSessions + in-process filtering.
// Results are ordered by most-recently updated first. limit <= 0 means no limit.
func (s *Service) SearchSessionsByTitle(ctx context.Context, principal *backendauth.Principal, needle string, limit int) ([]SessionInfo, error) {
	if s == nil {
		return nil, bkerr.Unavailable("query service not configured", nil)
	}
	if s.ownership == nil {
		// Unscoped mode: fall back to in-memory search.
		all, err := s.listSessionsUnscoped()
		if err != nil {
			return nil, err
		}
		lowerNeedle := strings.ToLower(needle)
		results := make([]SessionInfo, 0)
		for _, si := range all {
			if strings.Contains(strings.ToLower(si.Title), lowerNeedle) {
				results = append(results, si)
			}
		}
		return results, nil
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	owned, err := s.ownership.SearchByTitle(ctx, principal.User.ID, needle, limit)
	if err != nil {
		return nil, bkerr.Internal("search sessions by title: "+err.Error(), err)
	}
	runtimeMap := s.runtimeSessionMap()
	results := make([]SessionInfo, 0, len(owned))
	for _, o := range owned {
		info := SessionInfo{
			SessionID:       o.SessionID,
			UserID:          o.UserID,
			Title:           o.Title,
			ExecutionOrigin: o.ExecutionOrigin,
			WorkspacePath:   o.WorkspacePath,
			CreatedAt:       o.CreatedAt.Unix(),
			UpdatedAt:       o.UpdatedAt.Unix(),
		}
		if ri, ok := runtimeMap[o.SessionID]; ok {
			info.Status = string(ri.Status)
			info.TotalTurns = ri.TotalTurns
		}
		results = append(results, info)
	}
	return results, nil
}

// SearchSessionsByContent returns visible sessions whose stored messages contain
// needle. When the configured session manager exposes direct transcript search,
// this uses that path; otherwise it falls back to the SessionInspector scan used
// by older SDK runtimes.
func (s *Service) SearchSessionsByContent(ctx context.Context, principal *backendauth.Principal, needle string, limit int) ([]SessionInfo, error) {
	if s == nil {
		return nil, bkerr.Unavailable("query service not configured", nil)
	}
	if s.sessions == nil || limit <= 0 {
		return nil, nil
	}
	if searcher, ok := s.sessions.(TranscriptSearcher); ok {
		ids, err := searcher.SearchTranscriptsByContent(needle, limit)
		if err == nil {
			return s.sessionInfosFromIDs(ctx, principal, ids, limit)
		}
	}
	all, err := s.sessions.ListSessions()
	if err != nil {
		return nil, nil
	}
	lowerNeedle := strings.ToLower(needle)
	var results []SessionInfo
	for _, rs := range all {
		if len(results) >= limit {
			break
		}
		if s.ownership != nil {
			if principal == nil {
				continue
			}
			owned, oErr := s.ownership.GetBySessionID(ctx, rs.ID.String())
			if oErr != nil || owned == nil || owned.UserID != principal.User.ID {
				continue
			}
		}
		messages, msgErr := s.loadSessionMessages(ctx, rs.ID.String())
		if msgErr != nil {
			continue
		}
		for _, m := range messages {
			for _, block := range m.Content {
				if tc, ok := block.(types.TextContent); ok && strings.Contains(strings.ToLower(tc.Text), lowerNeedle) {
					si := SessionInfo{SessionID: rs.ID.String(), CreatedAt: rs.CreatedAt, UpdatedAt: rs.UpdatedAt}
					if s.ownership != nil && principal != nil {
						if owned, oErr := s.ownership.GetBySessionID(ctx, rs.ID.String()); oErr == nil && owned != nil {
							si.Title = owned.Title
						}
					}
					results = append(results, si)
					goto nextSession
				}
			}
		}
	nextSession:
	}
	return results, nil
}

func (s *Service) sessionInfosFromIDs(ctx context.Context, principal *backendauth.Principal, ids []sdk.SessionID, limit int) ([]SessionInfo, error) {
	if len(ids) == 0 || limit <= 0 {
		return nil, nil
	}
	runtimeMap := s.runtimeSessionMap()
	results := make([]SessionInfo, 0, min(len(ids), limit))
	for _, id := range ids {
		if len(results) >= limit {
			break
		}
		sessionID := id.String()
		info := SessionInfo{SessionID: sessionID}
		if ri, ok := runtimeMap[sessionID]; ok {
			info.CreatedAt = ri.CreatedAt
			info.UpdatedAt = ri.UpdatedAt
			info.Status = string(ri.Status)
			info.TotalTurns = ri.TotalTurns
			info.TotalTokens = ri.TotalTokens
		}
		if s.ownership != nil {
			if principal == nil {
				continue
			}
			owned, err := s.ownership.GetBySessionID(ctx, sessionID)
			if err != nil || owned == nil {
				continue
			}
			if owned.UserID != principal.User.ID {
				continue
			}
			info.UserID = owned.UserID
			info.Title = owned.Title
			info.ExecutionOrigin = owned.ExecutionOrigin
			info.ExecutionMode = owned.ForcedExecutionMode
			info.WorkspacePath = owned.WorkspacePath
			info.ProjectPath = owned.ProjectPath
			info.CreatedAt = owned.CreatedAt.Unix()
			info.UpdatedAt = owned.UpdatedAt.Unix()
		}
		results = append(results, info)
	}
	return results, nil
}

// GetSession returns one session plus its canonical transcript when available.
func (s *Service) GetSession(ctx context.Context, principal *backendauth.Principal, sessionID string) (*SessionDetail, error) {
	if s == nil {
		return nil, bkerr.Unavailable("query service not configured", nil)
	}
	if strings.TrimSpace(sessionID) == "" {
		return nil, bkerr.InvalidInput("session_id is required", nil)
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return nil, err
	}

	runtimeMap := s.runtimeSessionMap()
	runtimeInfo, ok := runtimeMap[sessionID]
	if !ok && s.ownership == nil {
		return nil, bkerr.NotFound("session not found", nil)
	}

	info := SessionInfo{SessionID: sessionID}
	if runtimeInfo != nil {
		info.Status = string(runtimeInfo.Status)
		info.TotalTurns = runtimeInfo.TotalTurns
		info.TotalTokens = runtimeInfo.TotalTokens
		info.CreatedAt = runtimeInfo.CreatedAt
		info.UpdatedAt = runtimeInfo.UpdatedAt
	}

	if s.ownership != nil {
		ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
		if err != nil {
			return nil, bkerr.NotFound("session not found", err)
		}
		info.UserID = ownership.UserID
		info.ProviderSettingID = ownership.ProviderSettingID
		info.ModelID = ownership.ModelID
		info.WorkspaceID = ownership.WorkspaceID
		info.OrganizationID = ownership.OrganizationID
		info.Title = ownership.Title
		info.PermissionMode = ownership.PermissionMode
		info.ExecutionOrigin = ownership.ExecutionOrigin
		info.ExecutionMode = ownership.ForcedExecutionMode
		info.WorkspacePath = ownership.WorkspacePath
		info.ProjectPath = ownership.ProjectPath
		info.CreatedAt = ownership.CreatedAt.Unix()
		info.UpdatedAt = ownership.UpdatedAt.Unix()
	}

	detail := &SessionDetail{SessionInfo: info}
	if inspector, ok := s.runtime.(SessionInspector); ok {
		messages, err := inspector.LoadSessionMessages(ctx, sessionID)
		if err != nil {
			return nil, bkerr.NotFound("session not found", err)
		}
		detail.Messages = messages
	}
	return detail, nil
}

// loadSessionMessages returns the messages for a session via SessionInspector.
func (s *Service) loadSessionMessages(ctx context.Context, sessionID string) ([]types.Message, error) {
	if inspector, ok := s.runtime.(SessionInspector); ok {
		return inspector.LoadSessionMessages(ctx, sessionID)
	}
	return nil, nil
}

// CreateSession creates a runtime session and records ownership. source is a
// UI-only hint ("" for a normal chat session, "knowledge" for one created by
// the Knowledge search page) - see SessionOwnership.Source.
func (s *Service) CreateSession(ctx context.Context, principal *backendauth.Principal, providerSettingID, modelID string, permissionMode types.PermissionMode, executionOrigin types.ExecutionOrigin, source string) (string, error) {
	if s == nil || s.sessions == nil {
		return "", bkerr.Unavailable("session store not available", nil)
	}
	if s.ownership != nil && principal == nil {
		return "", bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(modelID) != "" && strings.TrimSpace(providerSettingID) == "" {
		return "", bkerr.InvalidInput("provider_setting_id is required when model_id is provided", nil)
	}
	if strings.TrimSpace(providerSettingID) != "" {
		if s.settings == nil {
			return "", bkerr.Unavailable("provider settings resolver not configured", nil)
		}
		if _, err := s.settings.ResolveRuntimeConfig(ctx, principal, providerSettingID); err != nil {
			return "", err
		}
	}

	effectiveMode := types.NormalizePermissionModeOrDefault(permissionMode, types.PermissionModeOnRequest)
	effectiveOrigin := types.NormalizeExecutionOrigin(string(executionOrigin))

	handle, err := s.sessions.CreateSession(ctx)
	if err != nil {
		return "", bkerr.Internal(err.Error(), err)
	}
	if setter, ok := handle.(interface{ SetPermissionMode(sdk.PermissionMode) }); ok {
		setter.SetPermissionMode(sdk.PermissionMode(effectiveMode))
	}
	sessionID := handle.GetID().String()

	if s.ownership != nil && principal != nil {
		if _, err := s.ownership.Create(ctx, db.CreateSessionOwnershipParams{
			SessionID:         sessionID,
			UserID:            principal.User.ID,
			ProviderSettingID: strings.TrimSpace(providerSettingID),
			ModelID:           strings.TrimSpace(modelID),
			PermissionMode:    string(effectiveMode),
			ExecutionOrigin:   string(effectiveOrigin),
			Source:            strings.TrimSpace(source),
		}); err != nil {
			// Ownership creation failed — delete the orphaned runtime session
			_ = s.sessions.DeleteSession(sdk.SessionID(sessionID))
			return "", bkerr.Internal("track session ownership: "+err.Error(), err)
		}
	}

	return sessionID, nil
}

// EnsureSessionWorkspace resolves and creates the per-session workspace before
// the first query turn runs. This matters for Home-screen uploads: files can be
// attached immediately after session creation, before prepareRuntimeInput has a
// chance to lazily create the workspace for execution.
func (s *Service) EnsureSessionWorkspace(ctx context.Context, principal *backendauth.Principal, sessionID string) (string, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return "", bkerr.InvalidInput("session_id is required", nil)
	}
	if s == nil || s.ownership == nil {
		return "", nil
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return "", err
	}
	ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
	if err != nil {
		return "", bkerr.NotFound("session not found", err)
	}
	wsPath := strings.TrimSpace(ownership.WorkspacePath)
	if wsPath == "" {
		defaultPath, defErr := workspace.DefaultPath(sessionID)
		if defErr != nil {
			return "", bkerr.Internal("resolve session workspace: "+defErr.Error(), defErr)
		}
		wsPath = defaultPath
		if err := s.ownership.UpdateWorkspacePath(ctx, sessionID, wsPath); err != nil {
			return "", bkerr.Internal("track session workspace: "+err.Error(), err)
		}
	}
	if err := workspace.EnsureDir(wsPath); err != nil {
		return "", bkerr.Internal("create session workspace: "+err.Error(), err)
	}
	if ws, err := workspace.New(wsPath); err == nil {
		_ = ws.EnsureSubdirs()
	}
	return wsPath, nil
}

// DeleteSession deletes a session, enforcing ownership when configured.
func (s *Service) DeleteSession(ctx context.Context, principal *backendauth.Principal, sessionID string) error {
	if s == nil || s.sessions == nil {
		return bkerr.Unavailable("session store not available", nil)
	}
	if strings.TrimSpace(sessionID) == "" {
		return bkerr.InvalidInput("session_id is required", nil)
	}

	workspacePath := ""
	if s.ownership != nil {
		if principal == nil {
			return bkerr.Unauthorized("authentication required", nil)
		}
		ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
		if err != nil {
			return bkerr.NotFound("session not found", err)
		}
		if ownership.UserID != principal.User.ID {
			return bkerr.Forbidden("session belongs to another user", nil)
		}
		workspacePath = ownership.WorkspacePath
		if err := s.ownership.Delete(ctx, sessionID); err != nil {
			return bkerr.Internal("delete session ownership: "+err.Error(), err)
		}
	}

	if err := s.sessions.DeleteSession(sdk.SessionID(sessionID)); err != nil {
		return bkerr.NotFound(err.Error(), err)
	}
	s.cleanupSessionArtifacts(ctx, sessionID, workspacePath)
	return nil
}

// cleanupSessionArtifacts removes everything DeleteSession's own layers
// leave behind: the backend's file records + blobs (the `files` table and
// ArtifactStore - entirely separate from the SDK's own session/transcript
// store) and the on-disk workspace directory (uploads/, artifacts/, plans/,
// .previews/ - written directly by files.Service via os.WriteFile, never
// tracked by the SDK's session store either). Without this, every deleted
// conversation left 100% of its attachments on disk and in the files table
// forever - see the Part 2 persistence audit.
//
// Best-effort and silent-on-error by design: the session record itself is
// already gone by the time this runs (both branches above already
// succeeded), so a partial cleanup failure here must never surface as a
// failed delete - the user-visible "delete this conversation" contract is
// already satisfied.
func (s *Service) cleanupSessionArtifacts(ctx context.Context, sessionID, workspacePath string) {
	if s.files != nil {
		if err := s.files.DeleteBySessionID(ctx, sessionID); err != nil {
			fmt.Fprintf(os.Stderr, "[query] cleanup session %s files: %v\n", sessionID, err)
		}
	}
	if strings.TrimSpace(workspacePath) != "" {
		if err := os.RemoveAll(workspacePath); err != nil {
			fmt.Fprintf(os.Stderr, "[query] cleanup session %s workspace: %v\n", sessionID, err)
		}
	}
}

// SweepAbandonedSessions deletes sessions that were created but never
// actually used - TotalTurns == 0 (the same "not yet started" signal
// sessionCanBindProvider already relies on) and older than olderThan.
//
// Attaching a file creates a real session immediately, before any message
// is ever sent (see Home.tsx's ensureSessionCreated and
// Conversation.tsx's handleAttachFiles) - if the user then removes the
// attachment, closes the app, or just never sends, that session and its
// uploaded file(s) had nothing else to ever clean them up. A session
// becomes "used" the instant its first turn starts, so olderThan just needs
// to be long enough that this can never delete a conversation someone is
// actively about to send their first message into.
func (s *Service) SweepAbandonedSessions(ctx context.Context, olderThan time.Duration) (int, error) {
	if s == nil || s.sessions == nil || s.ownership == nil {
		return 0, nil
	}
	sessions, err := s.sessions.ListSessions()
	if err != nil {
		return 0, fmt.Errorf("list sessions: %w", err)
	}
	cutoff := time.Now().Add(-olderThan).Unix()
	deleted := 0
	for _, session := range sessions {
		if session == nil || session.TotalTurns != 0 || session.CreatedAt > cutoff {
			continue
		}
		sessionID := session.ID.String()
		ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
		if err != nil {
			continue // not ours to clean up (already gone, or unscoped mode)
		}
		if err := s.ownership.Delete(ctx, sessionID); err != nil {
			fmt.Fprintf(os.Stderr, "[query] sweep: delete ownership for abandoned session %s: %v\n", sessionID, err)
			continue
		}
		if err := s.sessions.DeleteSession(sdk.SessionID(sessionID)); err != nil {
			fmt.Fprintf(os.Stderr, "[query] sweep: delete abandoned session %s: %v\n", sessionID, err)
			continue
		}
		s.cleanupSessionArtifacts(ctx, sessionID, ownership.WorkspacePath)
		deleted++
	}
	return deleted, nil
}

func (s *Service) InterruptSession(ctx context.Context, principal *backendauth.Principal, sessionID string) error {
	if s == nil || s.runtime == nil {
		return bkerr.Unavailable("query runtime not configured", nil)
	}
	if strings.TrimSpace(sessionID) == "" {
		return bkerr.InvalidInput("session_id is required", nil)
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return err
	}

	interrupter, ok := s.runtime.(SessionInterrupter)
	if !ok {
		return bkerr.Unavailable("session interruption not supported by this runtime", nil)
	}
	if err := interrupter.InterruptSession(ctx, sessionID); err != nil {
		return bkerr.Internal("interrupt session: "+err.Error(), err)
	}
	return nil
}

// CancelSubagent cancels a running background sub-agent — one spawned via the
// spawn_agent tool from this session — freeing it up for close_agent/wait_agent
// callers and, if still active, the breadth-limit slot it holds (see
// agent.DefaultAsyncManager). Generated agent IDs are a predictable counter,
// not a capability token, so ownership is enforced by requiring the caller to
// name the session that spawned it: if the agent doesn't exist, already
// finished, or was spawned by a different session, this returns the same
// NotFound either way — deliberately indistinguishable, so this endpoint can't
// be used to enumerate other sessions' sub-agent IDs or lifecycle state.
func (s *Service) CancelSubagent(ctx context.Context, principal *backendauth.Principal, sessionID string, agentID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return bkerr.InvalidInput("session_id is required", nil)
	}
	if strings.TrimSpace(agentID) == "" {
		return bkerr.InvalidInput("agent_id is required", nil)
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return err
	}

	manager := agent.DefaultAsyncManager()
	asyncAgent, err := manager.GetAgent(agentID)
	if err != nil || asyncAgent == nil || string(asyncAgent.ParentSessionID) != sessionID {
		return bkerr.NotFound("no active sub-agent with that ID for this session", nil)
	}

	if err := manager.CloseAgent(agentID); err != nil {
		return bkerr.Internal("cancel sub-agent: "+err.Error(), err)
	}
	return nil
}

func (s *Service) UpdateSessionMetadata(ctx context.Context, principal *backendauth.Principal, sessionID string, title *string, permissionMode *types.PermissionMode, executionOrigin *types.ExecutionOrigin, providerSettingID *string, modelID *string, workspacePath *string, projectPath *string, executionMode *string) error {
	if s == nil {
		return bkerr.Unavailable("query service not configured", nil)
	}
	if strings.TrimSpace(sessionID) == "" {
		return bkerr.InvalidInput("session_id is required", nil)
	}
	if s.ownership == nil {
		return bkerr.Unavailable("session metadata updates are not supported by this runtime", nil)
	}
	if title == nil && permissionMode == nil && executionOrigin == nil && providerSettingID == nil && workspacePath == nil && projectPath == nil && executionMode == nil {
		return bkerr.InvalidInput("at least one session field must be updated", nil)
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return err
	}
	if title != nil {
		normalizedTitle := strings.TrimSpace(*title)
		if normalizedTitle == "" {
			return bkerr.InvalidInput("title is required", nil)
		}
		if err := s.ownership.UpdateTitle(ctx, sessionID, normalizedTitle); err != nil {
			return bkerr.Internal("update session title: "+err.Error(), err)
		}
	}
	if permissionMode != nil || executionOrigin != nil {
		ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
		if err != nil {
			return bkerr.NotFound("session not found", err)
		}
		effectiveMode := types.NormalizePermissionModeOrDefault(types.PermissionMode(ownership.PermissionMode), types.PermissionModeOnRequest)
		if permissionMode != nil {
			effectiveMode = types.NormalizePermissionModeOrDefault(*permissionMode, types.PermissionModeOnRequest)
		}
		effectiveOrigin := types.NormalizeExecutionOrigin(ownership.ExecutionOrigin)
		if executionOrigin != nil {
			effectiveOrigin = types.NormalizeExecutionOrigin(string(*executionOrigin))
		}
		if err := s.ownership.UpdateExecutionPolicy(ctx, sessionID, string(effectiveMode), string(effectiveOrigin)); err != nil {
			return bkerr.Internal("update session execution policy: "+err.Error(), err)
		}
		if permissionMode != nil {
			if updater, ok := s.runtime.(interface {
				UpdateSessionPermissionMode(context.Context, string, types.PermissionMode) error
			}); ok {
				if err := updater.UpdateSessionPermissionMode(ctx, sessionID, effectiveMode); err != nil {
					return bkerr.Internal("update runtime session permission mode: "+err.Error(), err)
				}
			}
		}
	}
	if providerSettingID != nil {
		pid := strings.TrimSpace(*providerSettingID)
		mid := ""
		if modelID != nil {
			mid = strings.TrimSpace(*modelID)
		}
		// A provider/model switch after the session already has turns would
		// silently leave the runtime session bound to whatever it started
		// with - only the ownership record's advertised provider/model would
		// change, drifting out of sync with what the LLM actually continues
		// using (and a genuine switch, if the runtime honored it mid-session,
		// could hand a different provider a transcript full of tool calls in
		// its predecessor's format). prepareRuntimeInput already enforces
		// this same TotalTurns==0 rule for the query-time binding path; this
		// closes the same gap on the session-metadata update path.
		canBind, err := s.sessionCanBindProvider(ctx, sessionID)
		if err != nil {
			return err
		}
		if !canBind {
			return bkerr.Conflict("cannot change provider/model after the session has started - create a new session instead", nil)
		}
		if err := s.ownership.UpdateProviderSelection(ctx, sessionID, pid, mid); err != nil {
			return bkerr.Internal("update session provider: "+err.Error(), err)
		}
	}
	if workspacePath != nil {
		wsPath := strings.TrimSpace(*workspacePath)
		if wsPath != "" {
			if err := workspace.EnsureDir(wsPath); err != nil {
				return bkerr.InvalidInput("workspace path is not accessible: "+err.Error(), err)
			}
		}
		if err := s.ownership.UpdateWorkspacePath(ctx, sessionID, wsPath); err != nil {
			return bkerr.Internal("update workspace path: "+err.Error(), err)
		}
	}
	if projectPath != nil {
		pp := strings.TrimSpace(*projectPath)
		if pp != "" {
			if err := workspace.EnsureDir(pp); err != nil {
				return bkerr.InvalidInput("project path is not accessible: "+err.Error(), err)
			}
		}
		if err := s.ownership.UpdateProjectPath(ctx, sessionID, pp); err != nil {
			return bkerr.Internal("update project path: "+err.Error(), err)
		}
	}
	if executionMode != nil {
		trimmed := strings.TrimSpace(*executionMode)
		if trimmed != "" && trimmed != "plan" && trimmed != "execute" {
			return bkerr.InvalidInput("execution_mode must be \"plan\", \"execute\", or empty to clear", nil)
		}
		if err := s.ownership.UpdateForcedExecutionMode(ctx, sessionID, trimmed); err != nil {
			return bkerr.Internal("update forced execution mode: "+err.Error(), err)
		}
	}
	return nil
}

// EnsureInitialSessionTitle gives a new chat a readable title before the first
// assistant tokens arrive. The SDK can still replace it later with its richer
// async title, but users should not stare at "Untitled conversation" during
// the first generation.
func (s *Service) EnsureInitialSessionTitle(ctx context.Context, principal *backendauth.Principal, sessionID, prompt string) (string, error) {
	if s == nil {
		return "", bkerr.Unavailable("query service not configured", nil)
	}
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return "", bkerr.InvalidInput("session_id is required", nil)
	}
	if s.ownership == nil {
		return "", nil
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return "", err
	}
	ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
	if err != nil {
		return "", bkerr.NotFound("session not found", err)
	}
	if !isUntitledSessionTitle(ownership.Title) {
		return "", nil
	}
	title := initialTitleFromPrompt(prompt)
	if title == "" || isUntitledSessionTitle(title) {
		return "", nil
	}
	if err := s.ownership.UpdateTitle(ctx, sessionID, title); err != nil {
		return "", bkerr.Internal("update session title: "+err.Error(), err)
	}
	return title, nil
}

func isUntitledSessionTitle(title string) bool {
	normalized := strings.ToLower(strings.TrimSpace(title))
	switch normalized {
	case "", "untitled conversation", "new chat":
		return true
	default:
		return strings.HasPrefix(normalized, "untitled_session_")
	}
}

func initialTitleFromPrompt(prompt string) string {
	text := strings.TrimSpace(prompt)
	if text == "" {
		return ""
	}
	text = stripURLs(text)
	text = strings.Map(func(r rune) rune {
		switch {
		case r == '\n' || r == '\r' || r == '\t':
			return ' '
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			return r
		case r == '\'' || r == '-' || r == '_' || r == '/' || r == ':':
			return r
		case unicode.IsSpace(r):
			return ' '
		default:
			return ' '
		}
	}, text)
	words := strings.Fields(text)
	for len(words) > 0 && isWeakTitleLead(words[0]) {
		words = words[1:]
	}
	if len(words) == 0 {
		return ""
	}
	title := strings.Join(words, " ")
	if len([]rune(title)) > 64 {
		title = truncateTitle(title, 64)
	}
	title = strings.Trim(title, " -_/:")
	if title == "" {
		return ""
	}
	return uppercaseFirst(title)
}

func stripURLs(text string) string {
	parts := strings.Fields(text)
	for i, part := range parts {
		lower := strings.ToLower(part)
		if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
			parts[i] = ""
		}
	}
	return strings.Join(parts, " ")
}

func isWeakTitleLead(word string) bool {
	cleaned := strings.ToLower(strings.Trim(word, " -_/:"))
	switch cleaned {
	case "salut", "hello", "hi", "bonjour", "stp", "svp", "please", "peux", "peux-tu", "cherche", "cherches", "recherche", "fais", "donne", "explique", "aide":
		return true
	default:
		return false
	}
}

func truncateTitle(title string, maxRunes int) string {
	runes := []rune(title)
	if len(runes) <= maxRunes {
		return title
	}
	cut := maxRunes
	for cut > 36 && !unicode.IsSpace(runes[cut-1]) {
		cut--
	}
	if cut <= 36 {
		cut = maxRunes
	}
	return strings.TrimSpace(string(runes[:cut]))
}

func uppercaseFirst(title string) string {
	runes := []rune(title)
	if len(runes) == 0 {
		return title
	}
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

func (s *Service) ResolveExecutionPolicy(ctx context.Context, principal *backendauth.Principal, sessionID string, requestedMode, fallbackMode types.PermissionMode, requestedOrigin types.ExecutionOrigin) (types.PermissionMode, types.ExecutionOrigin, error) {
	if s == nil {
		return "", "", bkerr.Unavailable("query service not configured", nil)
	}
	effectiveFallback := types.NormalizePermissionModeOrDefault(fallbackMode, types.PermissionModeOnRequest)
	if s.ownership == nil || strings.TrimSpace(sessionID) == "" {
		if requestedMode != "" {
			return types.NormalizePermissionModeOrDefault(requestedMode, effectiveFallback), types.NormalizeExecutionOrigin(string(requestedOrigin)), nil
		}
		return effectiveFallback, types.NormalizeExecutionOrigin(string(requestedOrigin)), nil
	}
	if err := s.checkSessionAccess(ctx, principal, sessionID); err != nil {
		return "", "", err
	}
	ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
	if err != nil {
		return "", "", bkerr.NotFound("session not found", err)
	}
	storedOrigin := types.NormalizeExecutionOrigin(ownership.ExecutionOrigin)
	if requestedMode != "" {
		effectiveOrigin := storedOrigin
		if requestedOrigin != "" {
			effectiveOrigin = types.NormalizeExecutionOrigin(string(requestedOrigin))
		}
		return types.NormalizePermissionModeOrDefault(requestedMode, effectiveFallback), effectiveOrigin, nil
	}
	if normalized, ok := types.NormalizePermissionMode(strings.TrimSpace(ownership.PermissionMode)); ok {
		return normalized, storedOrigin, nil
	}
	return effectiveFallback, storedOrigin, nil
}

// checkSessionAccess verifies that the principal can access the given session.
// A blank sessionID means a new session will be created — no check needed.
// checkSessionAccess deliberately does NOT grant an admin bypass, unlike
// files.Service.checkAccess and settings' local_provider.go — an admin who
// isn't the session owner still gets Forbidden here. This is intentional:
// conversation content stays confidential even from admins, whereas file
// metadata and provider settings are treated as operationally administrable.
// Verified by TestSessionOwnership_AdminCannotOverride. If this ever needs to
// change, change it here deliberately rather than "fixing an inconsistency".
func (s *Service) checkSessionAccess(ctx context.Context, principal *backendauth.Principal, sessionID string) error {
	if s.ownership == nil || strings.TrimSpace(sessionID) == "" {
		return nil
	}
	ownership, err := s.ownership.GetBySessionID(ctx, sessionID)
	if err != nil {
		return bkerr.NotFound("session not found", err)
	}
	// nil principal (headless/system call) bypasses ownership check.
	if principal != nil && ownership.UserID != principal.User.ID {
		return bkerr.Forbidden("session belongs to another user", nil)
	}
	return nil
}

// listSessionsUnscoped falls back to the raw runtime session list with no ownership info.
func (s *Service) listSessionsUnscoped() ([]SessionInfo, error) {
	if s.sessions == nil {
		return []SessionInfo{}, nil
	}
	runtimeSessions, err := s.sessions.ListSessions()
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := make([]SessionInfo, 0, len(runtimeSessions))
	for _, rs := range runtimeSessions {
		result = append(result, SessionInfo{
			SessionID:   rs.ID.String(),
			Status:      string(rs.Status),
			TotalTurns:  rs.TotalTurns,
			TotalTokens: rs.TotalTokens,
			CreatedAt:   rs.CreatedAt,
			UpdatedAt:   rs.UpdatedAt,
		})
	}
	return result, nil
}

// runtimeSessionMap returns a map sessionID→SessionInfo from the runtime store.
// Returns an empty map if sessions is nil or on error (best-effort).
func (s *Service) runtimeSessionMap() map[string]*sdk.SessionInfo {
	m := make(map[string]*sdk.SessionInfo)
	if s.sessions == nil {
		return m
	}
	runtimeSessions, err := s.sessions.ListSessions()
	if err != nil {
		return m
	}
	for _, rs := range runtimeSessions {
		rs := rs
		m[rs.ID.String()] = rs
	}
	return m
}

func (s *Service) prepareRuntimeInput(ctx context.Context, principal *backendauth.Principal, input QueryInput) (QueryInput, string, error) {
	runtimeInput := input
	runtimeInput.RuntimeProvider = nil
	// Without this, every plan document submit_plan creates is persisted
	// with an empty UserID (see QueryInput.UserID's doc comment) - it would
	// then fail its own ownership check on every later read, no matter who
	// asks.
	if principal != nil {
		runtimeInput.UserID = principal.User.ID
		runtimeInput.RAGAllowedOwnerIDs = ragAllowedOwnerIDs(principal)
	}

	// Build a per-request web search runner that closes over the current principal
	// so the tool enforces the user's quota and domain policy on every call.
	if s.webSearch != nil && principal != nil {
		ws := s.webSearch
		p := principal
		runtimeInput.WebSearchRunner = func(runCtx context.Context, query string, allowedDomains, blockedDomains []string) (webcore.SearchResponse, error) {
			resp, err := ws.Search(runCtx, p, bkwebsearch.SearchParams{
				Query:          query,
				AllowedDomains: allowedDomains,
				BlockedDomains: blockedDomains,
			})
			if err != nil {
				return webcore.SearchResponse{}, err
			}
			return webcore.SearchResponse{
				Query:           query,
				Provider:        resp.Provider,
				Results:         resp.Results,
				DurationSeconds: resp.DurationSeconds,
			}, nil
		}
	}

	if strings.TrimSpace(input.ModelID) != "" && strings.TrimSpace(input.ProviderSettingID) == "" && strings.TrimSpace(input.SessionID) == "" {
		return QueryInput{}, "", bkerr.InvalidInput("provider_setting_id is required when model_id is provided", nil)
	}
	if strings.TrimSpace(input.ProviderSettingID) == "" && strings.TrimSpace(input.SessionID) == "" {
		// No explicit provider and no session: fall back to the user's default provider.
		s.tryResolveDefaultProvider(ctx, principal, &runtimeInput)
		return runtimeInput, "", nil
	}
	if s.ownership == nil {
		if strings.TrimSpace(input.ProviderSettingID) == "" {
			// Unscoped/headless mode: no ownership tracking, skip default resolution.
			return runtimeInput, "", nil
		}
		if s.settings == nil {
			return QueryInput{}, "", bkerr.Unavailable("provider settings resolver not configured", nil)
		}
		resolved, err := s.settings.ResolveRuntimeConfig(ctx, principal, input.ProviderSettingID)
		if err != nil {
			return QueryInput{}, "", err
		}
		if strings.TrimSpace(input.ModelID) != "" {
			resolved.ModelID = strings.TrimSpace(input.ModelID)
		}
		runtimeInput.RuntimeProvider = resolvedProviderToRuntime(resolved)
		return runtimeInput, "", nil
	}

	if strings.TrimSpace(input.SessionID) == "" {
		if strings.TrimSpace(input.ProviderSettingID) == "" {
			// New session, ownership mode, no explicit provider: try user's default.
			s.tryResolveDefaultProvider(ctx, principal, &runtimeInput)
			return runtimeInput, "", nil
		}
		if s.settings == nil {
			return QueryInput{}, "", bkerr.Unavailable("provider settings resolver not configured", nil)
		}
		resolved, err := s.settings.ResolveRuntimeConfig(ctx, principal, input.ProviderSettingID)
		if err != nil {
			return QueryInput{}, "", err
		}
		if strings.TrimSpace(input.ModelID) != "" {
			resolved.ModelID = strings.TrimSpace(input.ModelID)
		}
		runtimeInput.RuntimeProvider = resolvedProviderToRuntime(resolved)
		return runtimeInput, encodeBinding(strings.TrimSpace(input.ProviderSettingID), strings.TrimSpace(resolved.ModelID)), nil
	}

	ownership, err := s.ownership.GetBySessionID(ctx, input.SessionID)
	if err != nil {
		return QueryInput{}, "", bkerr.NotFound("session not found", err)
	}
	runtimeInput.ForcedExecutionMode = ownership.ForcedExecutionMode

	// Resolve session workspace: use stored value or create the default per-session sandbox.
	if runtimeInput.WorkspacePath == "" {
		wsPath := strings.TrimSpace(ownership.WorkspacePath)
		if wsPath == "" {
			if defaultPath, defErr := workspace.DefaultPath(input.SessionID); defErr == nil {
				wsPath = defaultPath
				if mkErr := workspace.EnsureDir(wsPath); mkErr == nil {
					_ = s.ownership.UpdateWorkspacePath(ctx, input.SessionID, wsPath)
				}
			}
		} else {
			_ = workspace.EnsureDir(wsPath)
		}
		runtimeInput.WorkspacePath = wsPath
	}
	// Ensure standard subdirectory layout inside the session workspace.
	if runtimeInput.WorkspacePath != "" {
		if ws, err := workspace.New(runtimeInput.WorkspacePath); err == nil {
			_ = ws.EnsureSubdirs()
		}
	}
	// Resolve project path: user-chosen directory for the agent's CWD.
	if runtimeInput.ProjectPath == "" {
		if pp := strings.TrimSpace(ownership.ProjectPath); pp != "" {
			_ = workspace.EnsureDir(pp)
			runtimeInput.ProjectPath = pp
		}
	}

	boundSettingID := strings.TrimSpace(ownership.ProviderSettingID)
	boundModelID := strings.TrimSpace(ownership.ModelID)
	requestedSettingID := strings.TrimSpace(input.ProviderSettingID)
	requestedModelID := strings.TrimSpace(input.ModelID)

	switch {
	case boundSettingID != "":
		if s.settings == nil {
			return QueryInput{}, "", bkerr.Unavailable("provider settings resolver not configured", nil)
		}
		if requestedSettingID != "" && requestedSettingID != boundSettingID {
			return QueryInput{}, "", bkerr.InvalidInput("session is already bound to another provider setting", nil)
		}
		if requestedModelID != "" && boundModelID != "" && requestedModelID != boundModelID {
			return QueryInput{}, "", bkerr.InvalidInput("session is already bound to another model", nil)
		}
		resolved, err := s.settings.ResolveRuntimeConfig(ctx, principal, boundSettingID)
		if err != nil {
			return QueryInput{}, "", err
		}
		if boundModelID != "" {
			resolved.ModelID = boundModelID
		}
		runtimeInput.RuntimeProvider = resolvedProviderToRuntime(resolved)
		return runtimeInput, "", nil
	case requestedSettingID == "":
		// Existing session, no bound provider, no requested provider: try user's default.
		s.tryResolveDefaultProvider(ctx, principal, &runtimeInput)
		return runtimeInput, "", nil
	default:
		if s.settings == nil {
			return QueryInput{}, "", bkerr.Unavailable("provider settings resolver not configured", nil)
		}
		canBind, err := s.sessionCanBindProvider(ctx, input.SessionID)
		if err != nil {
			return QueryInput{}, "", err
		}
		if !canBind {
			return QueryInput{}, "", bkerr.InvalidInput("cannot attach a provider setting to a non-empty session", nil)
		}
		resolved, err := s.settings.ResolveRuntimeConfig(ctx, principal, requestedSettingID)
		if err != nil {
			return QueryInput{}, "", err
		}
		if requestedModelID != "" {
			resolved.ModelID = requestedModelID
		}
		runtimeInput.RuntimeProvider = resolvedProviderToRuntime(resolved)
		return runtimeInput, encodeBinding(requestedSettingID, strings.TrimSpace(resolved.ModelID)), nil
	}
}

func (s *Service) trackSessionBinding(ctx context.Context, principal *backendauth.Principal, inputSessionID, resultSessionID, providerSettingID string, permissionMode types.PermissionMode, executionOrigin types.ExecutionOrigin) {
	if s.ownership == nil || principal == nil {
		return
	}
	if strings.TrimSpace(resultSessionID) == "" {
		return
	}
	bindingProviderSettingID, bindingModelID := decodeBinding(providerSettingID)
	effectiveMode := types.NormalizePermissionModeOrDefault(permissionMode, types.PermissionModeOnRequest)
	effectiveOrigin := types.NormalizeExecutionOrigin(string(executionOrigin))
	if strings.TrimSpace(inputSessionID) == "" {
		_, _ = s.ownership.Create(ctx, db.CreateSessionOwnershipParams{
			SessionID:         resultSessionID,
			UserID:            principal.User.ID,
			ProviderSettingID: bindingProviderSettingID,
			ModelID:           bindingModelID,
			PermissionMode:    string(effectiveMode),
			ExecutionOrigin:   string(effectiveOrigin),
		})
		return
	}
	if bindingProviderSettingID != "" {
		_ = s.ownership.UpdateProviderSelection(ctx, resultSessionID, bindingProviderSettingID, bindingModelID)
	}
	_ = s.ownership.UpdateExecutionPolicy(ctx, resultSessionID, string(effectiveMode), string(effectiveOrigin))
}

func (s *Service) sessionCanBindProvider(ctx context.Context, sessionID string) (bool, error) {
	if s.sessions == nil {
		return false, bkerr.Unavailable("session store not available", nil)
	}
	sessions, err := s.sessions.ListSessions()
	if err != nil {
		return false, bkerr.Internal(err.Error(), err)
	}
	for _, session := range sessions {
		if session == nil || session.ID.String() != sessionID {
			continue
		}
		return session.TotalTurns == 0, nil
	}
	return false, bkerr.NotFound("session not found", nil)
}

// tryResolveDefaultProvider injects the user's default provider into runtimeInput
// when no RuntimeProvider is already set. It is a best-effort call — any error
// is silently ignored so the request can still proceed with the global API key.
func (s *Service) tryResolveDefaultProvider(ctx context.Context, principal *backendauth.Principal, runtimeInput *QueryInput) {
	if runtimeInput.RuntimeProvider != nil {
		return
	}
	if principal == nil || s.settings == nil {
		return
	}
	resolver, ok := s.settings.(defaultProviderResolver)
	if !ok {
		return
	}
	resolved, err := resolver.ResolveDefaultForUser(ctx, principal)
	if err != nil || resolved == nil {
		return
	}
	runtimeInput.RuntimeProvider = resolvedProviderToRuntime(resolved)
}

func resolvedProviderToRuntime(resolved *bksettings.ResolvedProviderConfig) *RuntimeProviderConfig {
	if resolved == nil {
		return nil
	}
	return &RuntimeProviderConfig{
		SettingID: resolved.SettingID,
		Provider:  resolved.Provider,
		BaseURL:   resolved.BaseURL,
		ModelID:   resolved.ModelID,
		Secret:    resolved.Secret,
	}
}

func encodeBinding(providerSettingID, modelID string) string {
	if providerSettingID == "" {
		return ""
	}
	return providerSettingID + "\x00" + modelID
}

func decodeBinding(binding string) (string, string) {
	if binding == "" {
		return "", ""
	}
	if providerSettingID, modelID, ok := strings.Cut(binding, "\x00"); ok {
		return strings.TrimSpace(providerSettingID), strings.TrimSpace(modelID)
	}
	return strings.TrimSpace(binding), ""
}

// ─── ResolvePolicyFromRequest ─────────────────────────────────────────────────

// ResolvePolicyFromRequest resolves the effective permission mode and execution
// origin for an incoming query request. It applies user preferences as the
// fallback before delegating to ResolveExecutionPolicy for session-level logic.
func (s *Service) ResolvePolicyFromRequest(ctx context.Context, principal *backendauth.Principal, sessionID, requestedModeRaw, requestedOriginRaw string) (types.PermissionMode, types.ExecutionOrigin, error) {
	trimmedRaw := strings.TrimSpace(requestedModeRaw)
	var requestedMode types.PermissionMode
	var hasRequestedMode bool
	if trimmedRaw != "" {
		mode, ok := types.NormalizePermissionMode(trimmedRaw)
		if !ok {
			return "", "", fmt.Errorf("invalid permission_mode %q", requestedModeRaw)
		}
		requestedMode = mode
		hasRequestedMode = true
	}

	requestedOrigin := types.NormalizeExecutionOrigin(strings.TrimSpace(requestedOriginRaw))
	fallbackMode := types.PermissionModeOnRequest
	if requestedOrigin == types.ExecutionOriginAutomation {
		fallbackMode = types.PermissionModeNever
	}

	if principal != nil && s.preferences != nil {
		resolved, err := s.preferences.ResolvePermissionModes(ctx, principal, requestedOrigin)
		if err != nil {
			return "", "", fmt.Errorf("load user preferences: %w", err)
		}
		fallbackMode = resolved
	}

	if !hasRequestedMode {
		requestedMode = ""
	}
	return s.ResolveExecutionPolicy(ctx, principal, sessionID, requestedMode, fallbackMode, requestedOrigin)
}

// ─── BuildContextInput ────────────────────────────────────────────────────────

// BuildContextInput constructs a QueryInput with a consistent precedence order
// for system prompt blocks: agent profile → skill-agent → user preferences →
// user memories → long-term memory → RAG context → attachments.
// Both blocking and streaming handlers call this to guarantee identical behaviour.
func (s *Service) BuildContextInput(ctx context.Context, p ContextBuildParams) (QueryInput, []RAGSearchResult) {
	// perf: this whole function runs synchronously before the first SSE byte
	// can be sent (see handleQueryStream) - memoriesMs/ragMs are the two
	// sub-costs most likely to dominate, since both can hit an embedding
	// call plus a vector/keyword search. See docs/produits/chat/seshatos-main-chat-ui-audit.md.
	buildStart := time.Now()
	var skillsMs, memListMs, memLTMMs, ragMs int64

	effectiveAgentSlug := strings.TrimSpace(p.AgentSlug)

	userID := ""
	if p.Principal != nil {
		userID = p.Principal.User.ID
	}

	// Expand "/skillname [args]" prompt shortcuts.
	prompt := p.Prompt
	if s.skills != nil {
		skillsStart := time.Now()
		prompt = s.skills.ResolvePrompt(ctx, userID, prompt)
		skillsMs = time.Since(skillsStart).Milliseconds()
	}

	input := QueryInput{
		Prompt:            prompt,
		SessionID:         p.SessionID,
		ProviderSettingID: p.ProviderSettingID,
		ModelID:           p.ModelID,
		PermissionMode:    p.PermissionMode,
		ExecutionOrigin:   p.ExecutionOrigin,
		PromptFn:          p.PromptFn,
		AgentSlug:         effectiveAgentSlug,
	}

	// Agent profile: resolved first so preferences/memories/RAG layer on top.
	// DB-defined agents take precedence over built-ins; skills-derived agents
	// are loaded last as a fallback. The agent's system prompt replaces the
	// engine's default identity entirely (SystemPromptOverride). Model and
	// permission mode are applied only when not explicitly set by the caller.
	if effectiveAgentSlug != "" {
		var def *agent.AgentDefinition
		if s.agents != nil {
			def, _ = s.agents.GetDefinition(ctx, p.Principal, effectiveAgentSlug)
		}
		if def == nil {
			// Fall back to skill-derived agents.
			reg := agent.NewAgentRegistry()
			_ = reg.LoadFromSkills("", userID)
			def, _ = reg.Get(effectiveAgentSlug)
		}
		if def != nil {
			if def.GetSystemPrompt != nil {
				if sp := def.GetSystemPrompt(); sp != "" {
					input.SystemPromptOverride = &sp
				}
			}
			if input.ModelID == "" && def.Model != "" {
				input.ModelID = def.Model
			}
			if input.PermissionMode == "" && def.PermissionMode != "" {
				input.PermissionMode = def.PermissionMode
			}
			if allowed, restrict := toolAllowlistFromPatterns(def.GetToolPatterns()); restrict {
				input.AllowedTools = allowed
			}
		}
	}

	// No agent definition supplied its own system prompt (plain chat, or an
	// agent_slug that didn't resolve to anything) - fall back to the
	// product-owned General Agent prompt instead of silently letting the
	// SDK's own internal default (seshat/internal/prompt) apply.
	if input.SystemPromptOverride == nil {
		defaultPrompt := backendprompt.DefaultCorePrompt()
		input.SystemPromptOverride = &defaultPrompt
	}

	if input.AppendSystemPrompt == nil && p.AppendSystemPrompt != nil && *p.AppendSystemPrompt != "" {
		input.AppendSystemPrompt = p.AppendSystemPrompt
	}

	// Static rendering-capability note: the model has no way to discover
	// UI-only conventions like ```chart on its own the way it might infer
	// ```mermaid support from general training data, so it needs to be told
	// explicitly. Unconditional (not gated on principal/session) since it
	// costs a fixed handful of tokens and applies to every surface.
	input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, renderingCapabilitiesBlock)
	input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, narrationGuidanceBlock)

	// Layer user preference block on top (appended, never overwritten).
	if p.Principal != nil && s.preferences != nil {
		if block, _ := s.preferences.BuildSystemPromptBlock(ctx, p.Principal); block != "" {
			input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, block)
		}
	}

	// Layer user memories (explicit user-defined knowledge) after preferences.
	if p.Principal != nil && s.memories != nil {
		memListStart := time.Now()
		mems, err := s.memories.List(ctx, p.Principal)
		memListMs = time.Since(memListStart).Milliseconds()
		if err == nil && len(mems) > 0 {
			const maxMemories = 30
			if len(mems) > maxMemories {
				mems = mems[:maxMemories]
			}
			if block := buildUserMemoriesBlock(mems); block != "" {
				input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, block)
			}
		}
	}

	// Long-term memory: inject relevant entities found for the current prompt.
	if p.Principal != nil && s.memories != nil {
		ltmStart := time.Now()
		block, err := s.memories.BuildContextBlock(ctx, p.Principal, p.Prompt)
		memLTMMs = time.Since(ltmStart).Milliseconds()
		if err == nil && block != "" {
			input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, block)
		}
	}

	// RAG: build and append knowledge context block when a corpus is attached.
	var ragResults []RAGSearchResult
	if strings.TrimSpace(p.CorpusID) != "" && s.knowledge != nil {
		if p.OnStage != nil {
			p.OnStage("knowledge", "Searching knowledge base")
		}
		ragStart := time.Now()
		ragBlock, results := buildRAGContext(ctx, p.Principal, s.knowledge, p.CorpusID, p.Prompt)
		ragMs = time.Since(ragStart).Milliseconds()
		ragResults = results
		if ragBlock != "" {
			input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, ragBlock)
		}
	}

	// Record which sent user message these files belong to, so the transcript
	// can still show them after the sender's in-memory optimistic attachment
	// state is gone (reload, app restart) - see filesProvider.AttachToMessage.
	// messageIndex is this turn's position: the count of user messages already
	// in the transcript before it lands.
	if len(p.FileIDs) > 0 && s.files != nil && p.SessionID != "" {
		if existing, err := s.loadSessionMessages(ctx, p.SessionID); err == nil {
			messageIndex := 0
			for _, m := range existing {
				if m.Role == types.RoleUser {
					messageIndex++
				}
			}
			_ = s.files.AttachToMessage(ctx, p.FileIDs, p.SessionID, messageIndex)
		}
	}

	// Per-turn attachments: split by category.
	// - Images  → base64-encode and inject as multimodal content blocks.
	// - Others  → list as attached files and let read_file/document-reader extract on demand.
	if len(p.FileIDs) > 0 && s.files != nil {
		var imageIDs, textIDs []string
		for _, fid := range p.FileIDs {
			meta, err := s.files.GetFile(ctx, p.Principal, strings.TrimSpace(fid))
			if err != nil || meta == nil {
				textIDs = append(textIDs, fid)
				continue
			}
			if meta.Category == backendfiles.CategoryImages {
				imageIDs = append(imageIDs, fid)
			} else {
				textIDs = append(textIDs, fid)
			}
		}

		for _, fid := range imageIDs {
			data, meta, err := s.files.DownloadFile(ctx, p.Principal, fid)
			if err != nil || meta == nil {
				continue
			}
			ct := strings.TrimSpace(strings.Split(meta.ContentType, ";")[0])
			if ct == "" {
				ct = "image/jpeg"
			}
			input.Images = append(input.Images, ImageAttachment{
				MediaType: ct,
				Data:      base64.StdEncoding.EncodeToString(data),
			})
		}

		if len(textIDs) > 0 {
			workspacePath := ""
			if p.SessionID != "" {
				if detail, detailErr := s.GetSession(ctx, p.Principal, p.SessionID); detailErr == nil {
					workspacePath = detail.WorkspacePath
				}
			}
			if block := buildAttachmentContext(ctx, p.Principal, s.files, textIDs, workspacePath); block != "" {
				input.AppendSystemPrompt = appendBlock(input.AppendSystemPrompt, block)
			}
		}
	}

	log.Printf("[perf] context_build session=%q corpus=%q skills_ms=%d mem_list_ms=%d mem_ltm_ms=%d rag_ms=%d total_ms=%d",
		p.SessionID, p.CorpusID, skillsMs, memListMs, memLTMMs, ragMs, time.Since(buildStart).Milliseconds())

	return input, ragResults
}

// toolAllowlistFromPatterns turns GetToolPatterns() into an exact-name
// allowlist. A bare "*" (AgentDefinition.Tools == nil) means fully
// unrestricted. Any other glob (e.g. "inbox_*") isn't supported by this
// exact-match filter yet - fail OPEN (no restriction) rather than silently
// blocking every tool for an agent whose pattern can't be correctly
// evaluated; extend this if a future agent definition actually needs
// glob-style tool patterns.
func toolAllowlistFromPatterns(patterns []string) (allowed []string, restrict bool) {
	for _, p := range patterns {
		if p == "*" || strings.Contains(p, "*") {
			return nil, false
		}
	}
	return patterns, len(patterns) > 0
}
