// Package inbox implements the Inbox Agent's channel-agnostic core: a
// shared data model (channel accounts, threads, messages, contacts) plus a
// Connector interface each channel (Gmail, WhatsApp, ...) implements, so
// sync/send/triage logic lives in exactly one place regardless of how many
// channels exist.
package inbox

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"strings"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/automation"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"golang.org/x/oauth2"
)

// maxAttachmentBytes bounds both the eager (WhatsApp) and lazy (Gmail)
// attachment fetch paths - both pull the full blob into memory
// (ArtifactStore.Put([]byte, ...), whatsmeow's Download returns []byte), so
// this guards against a stray large file blowing up memory. An oversized
// attachment keeps its metadata (still visible as "an attachment exists")
// but is simply not downloadable - a stated limitation, not silent data
// loss.
const maxAttachmentBytes = 25 * 1024 * 1024

// authExpiredMessage is the user-facing LastError set on a channel account
// once isAuthExpired classifies a sync/send failure as a dead OAuth refresh
// token - deliberately not Google's raw "invalid_grant" text, which means
// nothing to a non-technical user.
const authExpiredMessage = "Authorization has expired - reconnect this account to keep syncing."

// isAuthExpired reports whether err is a dead/revoked OAuth refresh token
// (Google's "invalid_grant" from the token endpoint) - generic across any
// oauth2-based connector, not Gmail-specific, so it lives here rather than
// in internal/inbox/gmail. errors.As walks through the %w-wrapping
// Connector.Sync/Send already do, so this works regardless of how many
// layers deep the error originated.
func isAuthExpired(err error) bool {
	var retrieveErr *oauth2.RetrieveError
	if errors.As(err, &retrieveErr) {
		return retrieveErr.ErrorCode == "invalid_grant"
	}
	return false
}

// WorkflowExecutor runs prompt as agentSlug on behalf of ownerID and
// returns the agent's final text response. modelOverride is "provider:model"
// or empty for the owner's default. Deliberately a plain function type
// rather than an interface/direct query.Service dependency, so
// internal/inbox never needs to import internal/query - mirrors
// internal/cloudautomation.JobExecutor's own closure shape (see that
// package's doc comment) and internal/config/bootstrap.go's
// cloudAutomationExecutor, the proven pattern this is copied from: build a
// bare *backendauth.Principal for ownerID (no AuthSession/roles needed),
// resolve the model override, then Query.BuildContextInput + Query.RunPrompt
// with ExecutionOrigin: types.ExecutionOriginAutomation.
type WorkflowExecutor func(ctx context.Context, ownerID, agentSlug, prompt, modelOverride string) (string, error)

type Service struct {
	accounts   *db.ChannelAccountStore
	contacts   *db.InboxContactStore
	threads    *db.InboxThreadStore
	messages   *db.InboxMessageStore
	connectors map[string]Connector
	artifacts  storage.ArtifactStore
	// workflows persists TriggerTypeEvent jobs (see WithWorkflowStore) -
	// nil until bootstrap.go wires it, same nil-tolerant posture as
	// artifacts/executeWorkflow below.
	workflows       *WorkflowStore
	executeWorkflow WorkflowExecutor
	// askWorkflow/nodeRegistry/graphSecrets back Job.Graph execution (see
	// workflow_graph.go) — all nil-tolerant like executeWorkflow above,
	// wired by WithWorkflowAsker/WithNodeRegistry/WithDataflowSecrets.
	askWorkflow  WorkflowAsker
	nodeRegistry *dataflow.Registry
	graphSecrets dataflow.SecretResolver
}

func NewService(
	accounts *db.ChannelAccountStore,
	contacts *db.InboxContactStore,
	threads *db.InboxThreadStore,
	messages *db.InboxMessageStore,
) *Service {
	return &Service{
		accounts:   accounts,
		contacts:   contacts,
		threads:    threads,
		messages:   messages,
		connectors: make(map[string]Connector),
	}
}

// WithArtifactStore attaches the blob store attachment bytes are read from
// and written to - same storage.ArtifactStore interface internal/files
// already uses (see internal/config/bootstrap.go, where it's constructed
// once and shared). Nil-tolerant: without it, attachment metadata is still
// recorded and visible, but nothing is downloadable (Service.OpenAttachment
// returns a clear "blob storage not configured" error) - the same
// graceful-degrade posture files.Service has when its own store is nil.
func (s *Service) WithArtifactStore(store storage.ArtifactStore) *Service {
	s.artifacts = store
	return s
}

// WithWorkflowStore attaches the local persistence for TriggerTypeEvent
// workflows (see internal/config/bootstrap.go for how it's built - backed
// by db.InboxWorkflowStore). Nil-tolerant, same posture as WithArtifactStore.
func (s *Service) WithWorkflowStore(store *WorkflowStore) *Service {
	s.workflows = store
	return s
}

// WithWorkflowExecutor attaches the closure that actually runs a matched
// workflow's agent turn - see WorkflowExecutor's doc comment. Nil-tolerant:
// without it (or WithWorkflowStore), dispatchWorkflows is a no-op, so
// message ingestion behaves exactly as before this feature existed.
func (s *Service) WithWorkflowExecutor(fn WorkflowExecutor) *Service {
	s.executeWorkflow = fn
	return s
}

// RegisterConnector wires a channel implementation in. Call once per
// supported channel during startup (see config/bootstrap.go) - a channel
// with no registered connector can still be listed/browsed (its already-
// synced data doesn't disappear) but SyncAccount/SendReply on it fail
// clearly rather than silently no-op.
func (s *Service) RegisterConnector(c Connector) {
	if s == nil || c == nil {
		return
	}
	s.connectors[c.Channel()] = c
}

// ─── Channel accounts ───────────────────────────────────────────────────────

func (s *Service) ConnectAccount(ctx context.Context, principal *backendauth.Principal, params ConnectAccountParams) (*ChannelAccount, error) {
	if s == nil || s.accounts == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	channel := strings.TrimSpace(params.Channel)
	if channel == "" {
		return nil, bkerr.InvalidInput("channel is required", nil)
	}

	// Reconnecting an already-known account (same user, channel, and
	// external ID - e.g. redoing Gmail's OAuth flow after its refresh
	// token expired) must update that account in place, not create a
	// second row: UpdateConnected already resets status to connected and
	// clears last_error, exactly what a successful reconnect needs.
	recordID := ""
	if existing, found, err := s.accounts.GetByChannelAndExternalID(ctx, principal.User.ID, channel, params.ExternalAccountID); err != nil {
		return nil, bkerr.Internal("look up existing channel account", err)
	} else if found {
		recordID = existing.ID
	} else {
		record, err := s.accounts.Create(ctx, db.CreateChannelAccountParams{
			UserID:            principal.User.ID,
			WorkspaceID:       params.WorkspaceID,
			Channel:           channel,
			DisplayName:       params.DisplayName,
			ExternalAccountID: params.ExternalAccountID,
		})
		if err != nil {
			return nil, bkerr.Internal("create channel account", err)
		}
		recordID = record.ID
	}

	connected, err := s.accounts.UpdateConnected(ctx, db.UpdateChannelAccountConnectedParams{
		ID:                recordID,
		DisplayName:       params.DisplayName,
		ExternalAccountID: params.ExternalAccountID,
		AccessToken:       params.AccessToken,
		RefreshToken:      params.RefreshToken,
		SessionState:      params.SessionState,
		Scope:             params.Scope,
		ExpiresAt:         params.ExpiresAt,
	})
	if err != nil {
		return nil, bkerr.Internal("connect channel account", err)
	}
	return accountFromDB(*connected), nil
}

func (s *Service) ListAccounts(ctx context.Context, principal *backendauth.Principal) ([]ChannelAccount, error) {
	if s == nil || s.accounts == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	records, err := s.accounts.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("list channel accounts", err)
	}
	out := make([]ChannelAccount, 0, len(records))
	for _, r := range records {
		out = append(out, *accountFromDB(r))
	}
	return out, nil
}

func (s *Service) DisconnectAccount(ctx context.Context, principal *backendauth.Principal, accountID string) error {
	account, err := s.getOwnedAccount(ctx, principal, accountID)
	if err != nil {
		return err
	}
	return s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusDisconnected, "")
}

// ListConnectedAccountsByChannel lists every connected account for a
// channel across all users - unscoped by design, for system-level startup
// work (e.g. reconnecting every already-paired WhatsApp device when the
// process starts), never for a user-facing endpoint.
func (s *Service) ListConnectedAccountsByChannel(ctx context.Context, channel string) ([]ChannelAccount, error) {
	if s == nil || s.accounts == nil {
		return nil, bkerr.Unavailable("inbox store not configured", nil)
	}
	records, err := s.accounts.ListByChannelAndStatus(ctx, channel, db.ChannelAccountStatusConnected)
	if err != nil {
		return nil, bkerr.Internal("list channel accounts", err)
	}
	out := make([]ChannelAccount, 0, len(records))
	for _, r := range records {
		out = append(out, *accountFromDB(r))
	}
	return out, nil
}

// MarkAccountError records a connector-level failure against an account
// outside the normal SyncAccount path (e.g. WhatsApp's Manager detecting a
// dropped/logged-out session from its own background event loop, not from
// a request-driven Sync call).
func (s *Service) MarkAccountError(ctx context.Context, accountID, status, lastError string) error {
	if s == nil || s.accounts == nil {
		return bkerr.Unavailable("inbox store not configured", nil)
	}
	return s.accounts.UpdateStatus(ctx, accountID, status, lastError)
}

// ─── Sync ────────────────────────────────────────────────────────────────────

// SyncAccount pulls new messages for one channel account through its
// registered Connector and persists them. Safe to call repeatedly/on a
// schedule (see internal/cloudautomation's job executor) - both the message
// store's Create and the thread store's Upsert are idempotent per external
// ID, so re-observing the same message twice is a no-op.
func (s *Service) SyncAccount(ctx context.Context, principal *backendauth.Principal, accountID string) (newMessages int, err error) {
	dbAccount, account, err := s.getOwnedAccountRecord(ctx, principal, accountID)
	if err != nil {
		return 0, err
	}
	connector, ok := s.connectors[account.Channel]
	if !ok {
		return 0, bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}

	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return 0, bkerr.Internal("load channel account secret", err)
	}

	normalized, nextCursor, syncErr := connector.Sync(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	})
	if syncErr != nil {
		if isAuthExpired(syncErr) {
			// A dead refresh token isn't a transient failure the next sync
			// might recover from - flip status to error (with a clear,
			// human message) so the account drops out of
			// ListConnectedAccountsByChannel's candidates instead of
			// failing silently every 2 minutes, and shows up in the UI as
			// needing reconnection.
			_ = s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusError, authExpiredMessage)
		} else {
			_ = s.accounts.UpdateSyncState(ctx, db.UpdateChannelAccountSyncParams{
				ID:           account.ID,
				SyncCursor:   dbAccount.SyncCursor,
				LastSyncedAt: dbAccount.LastSyncedAt,
				LastError:    syncErr.Error(),
			})
		}
		return 0, bkerr.BadGateway(fmt.Sprintf("sync failed for channel %q", account.Channel), syncErr)
	}

	for _, m := range normalized {
		if _, err := s.persistNormalizedMessage(ctx, account.ID, m, true); err != nil {
			return newMessages, bkerr.Internal("persist synced message", err)
		}
		newMessages++
	}

	if err := s.accounts.UpdateSyncState(ctx, db.UpdateChannelAccountSyncParams{
		ID:           account.ID,
		SyncCursor:   nextCursor,
		LastSyncedAt: time.Now(),
		LastError:    "",
	}); err != nil {
		return newMessages, bkerr.Internal("update sync state", err)
	}
	return newMessages, nil
}

// IngestMessage persists one already-normalized message directly, without
// going through SyncAccount/Connector.Sync - for push-based channels (e.g.
// WhatsApp via whatsmeow) whose connector keeps a live connection and
// receives messages as they happen instead of being polled. accountID must
// already be a valid, connected channel account; there is no principal
// here because the caller is the channel's own persistent event handler,
// not an HTTP request.
func (s *Service) IngestMessage(ctx context.Context, accountID string, m NormalizedMessage) error {
	if s == nil || s.accounts == nil {
		return bkerr.Unavailable("inbox store not configured", nil)
	}
	if _, err := s.persistNormalizedMessage(ctx, accountID, m, true); err != nil {
		return bkerr.Internal("ingest message", err)
	}
	return nil
}

// persistNormalizedMessage upserts the contact/thread and creates the
// message row, returning the upserted thread so callers that need it (e.g.
// SearchMessages, to hand the agent back real local threads) don't have to
// re-fetch it. fireWorkflows controls whether event-triggered workflows may
// fire for this message - true for anything that represents a genuinely new
// arrival (SyncAccount, IngestMessage), false for a search hit that's just
// making already-existing external mail locally visible (see
// MessageSearcher's doc comment).
func (s *Service) persistNormalizedMessage(ctx context.Context, accountID string, m NormalizedMessage, fireWorkflows bool) (*db.InboxThread, error) {
	contact, err := s.contacts.Upsert(ctx, db.UpsertContactParams{
		ChannelAccountID: accountID,
		ExternalID:       m.ContactExternalID,
		DisplayName:      m.ContactDisplayName,
		AvatarURL:        m.ContactAvatarURL,
	})
	if err != nil {
		return nil, fmt.Errorf("upsert contact: %w", err)
	}

	thread, err := s.threads.Upsert(ctx, db.UpsertThreadParams{
		ChannelAccountID: accountID,
		ExternalThreadID: m.ExternalThreadID,
		ContactID:        contact.ID,
		Subject:          m.ThreadSubject,
		LastMessageAt:    m.SentAt,
	})
	if err != nil {
		return nil, fmt.Errorf("upsert thread: %w", err)
	}

	senderContactID := ""
	if m.Direction == MessageDirectionInbound {
		senderContactID = contact.ID
	}
	attachmentsJSON, err := s.storeAttachments(ctx, m.Attachments)
	if err != nil {
		return nil, fmt.Errorf("store attachments: %w", err)
	}
	if _, err := s.messages.Create(ctx, db.CreateMessageParams{
		ThreadID:          thread.ID,
		ChannelAccountID:  accountID,
		ExternalMessageID: m.ExternalMessageID,
		Direction:         m.Direction,
		SenderContactID:   senderContactID,
		BodyText:          m.BodyText,
		AttachmentsJSON:   attachmentsJSON,
		SentAt:            m.SentAt,
	}); err != nil {
		return nil, fmt.Errorf("create message: %w", err)
	}

	if fireWorkflows {
		// Fire in a goroutine - a slow agent turn (or several matching
		// workflows) must never block message ingestion, the same reasoning
		// job_scheduler.go's own execute() runs jobs as goroutines off the
		// ticker rather than inline.
		go s.dispatchWorkflows(accountID, contact.DisplayName, m, thread.Status)
	}
	return thread, nil
}

// dispatchWorkflows fires every active TriggerTypeEvent workflow (see
// InboxMessageEventType) belonging to accountID's owner
// whose EventFilter matches this message. Deliberately only inbound
// messages trigger anything - an agent's own drafted/sent reply later
// syncing back as an outbound message must not re-fire the same rule.
// Best-effort: every failure is logged and skipped rather than propagated,
// since this always runs off the main ingestion path (see the goroutine in
// persistNormalizedMessage) with nothing left to report an error to.
func (s *Service) dispatchWorkflows(accountID, senderDisplayName string, m NormalizedMessage, threadStatus string) {
	// A workflow needs one of the two executors below depending on whether
	// it has a Graph (see runWorkflowAndRecord's dispatch) - bail out only
	// if neither is configured, not just executeWorkflow, so a deployment
	// wired for Graph-only workflows (WithWorkflowAsker, no
	// WithWorkflowExecutor) still dispatches.
	if s == nil || s.workflows == nil || (s.executeWorkflow == nil && s.askWorkflow == nil) || m.Direction != MessageDirectionInbound {
		return
	}
	ctx := context.Background()

	account, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		log.Printf("[inbox] dispatchWorkflows: load account %s: %v", accountID, err)
		return
	}

	jobs, err := s.workflows.ListJobs(ctx, account.UserID)
	if err != nil {
		log.Printf("[inbox] dispatchWorkflows: list jobs for %s: %v", account.UserID, err)
		return
	}

	sender := senderDisplayName
	if sender == "" {
		sender = m.ContactExternalID
	}
	event := InboxMessageEvent{
		Channel:      account.Channel,
		Sender:       sender,
		Subject:      m.ThreadSubject,
		Body:         m.BodyText,
		ThreadStatus: threadStatus,
		ReceivedAt:   m.SentAt,
	}
	payload := event.Payload()
	contextText := formatWorkflowEventContext(event)

	for _, job := range jobs {
		if job.Status != automation.JobStatusActive || !job.Trigger.IsEvent() ||
			job.Trigger.EventType != InboxMessageEventType {
			continue
		}
		matched, err := EvaluateEventFilter(job.Trigger.EventFilter, payload)
		if err != nil {
			log.Printf("[inbox] dispatchWorkflows: workflow %q (%s) has an invalid filter: %v", job.Name, job.ID, err)
			continue
		}
		if !matched {
			continue
		}
		s.runWorkflowAndRecord(ctx, job, contextText)
	}
}

// runWorkflowAndRecord runs job's agent turn via s.executeWorkflow (the
// real, fully-tooled query.Service.RunPrompt path - see WorkflowExecutor's
// doc comment for why this isn't automation.JobScheduler.RunEvent),
// records a JobRun, and applies the same RunCount/MaxRuns bookkeeping the
// SDK's applyRunOutcome does for time-based jobs (reimplemented here since
// that function is unexported and this job never had a schedule to
// recompute in the first place - Trigger.IsEvent() jobs never get a
// NextRunAt, so there's nothing to reschedule, only the MaxRuns check).
func (s *Service) runWorkflowAndRecord(ctx context.Context, job *automation.Job, contextText string) {
	if job.Graph != nil {
		s.runGraphAndRecord(ctx, job, contextText)
		return
	}
	run := &automation.JobRun{
		JobID:     job.ID,
		StartedAt: time.Now(),
		Status:    automation.RunStatusRunning,
	}
	if err := s.workflows.CreateRun(ctx, run); err != nil {
		log.Printf("[inbox] runWorkflowAndRecord: create run for workflow %s: %v", job.ID, err)
		return
	}

	execCtx := ctx
	if job.MaxDuration > 0 {
		var cancel context.CancelFunc
		execCtx, cancel = context.WithTimeout(ctx, job.MaxDuration)
		defer cancel()
	}

	output, execErr := s.executeWorkflow(execCtx, job.OwnerID, job.Agent.Slug, job.Task+"\n\n"+contextText, job.Agent.Model)

	endedAt := time.Now()
	run.EndedAt = &endedAt
	run.Output = output
	if execErr != nil {
		run.Status = automation.RunStatusError
		if errors.Is(execErr, context.DeadlineExceeded) {
			run.Error = fmt.Sprintf("execution timed out after %s", job.MaxDuration)
		} else {
			run.Error = execErr.Error()
		}
		log.Printf("[inbox] runWorkflowAndRecord: workflow %q (%s) failed: %v", job.Name, job.ID, execErr)
	} else {
		run.Status = automation.RunStatusSuccess
	}
	if err := s.workflows.UpdateRun(ctx, run); err != nil {
		log.Printf("[inbox] runWorkflowAndRecord: update run for workflow %s: %v", job.ID, err)
	}

	job.LastRunAt = &endedAt
	job.LastRunStatus = string(run.Status)
	job.RunCount++
	if job.MaxRuns > 0 && job.RunCount >= job.MaxRuns {
		job.Status = automation.JobStatusInactive // run-count budget exhausted
	}
	job.UpdatedAt = endedAt
	if err := s.workflows.UpdateJob(ctx, job); err != nil {
		log.Printf("[inbox] runWorkflowAndRecord: update workflow %s: %v", job.ID, err)
	}
}

// formatWorkflowEventContext renders event as the readable text appended
// below a workflow's Task, so the agent sees exactly what triggered it
// without needing its own inbox_get_thread round trip just to learn the
// sender/subject/body already known at dispatch time.
func formatWorkflowEventContext(event InboxMessageEvent) string {
	return fmt.Sprintf(
		"Triggering message:\nChannel: %s\nFrom: %s\nSubject: %s\nBody: %s",
		event.Channel, event.Sender, event.Subject, event.Body,
	)
}

// storeAttachments mints an ID for any attachment missing one, and for any
// attachment already carrying bytes (Data != nil - WhatsApp's eager
// download path), stores them in ArtifactStore and records the resulting
// StorageKey. Returns the marshaled JSON to persist on the message row.
// Never fails the whole message over one attachment's storage problem: an
// oversized or unstorable attachment degrades to metadata-only (empty
// StorageKey, simply not downloadable later) rather than losing the
// message - the same "skip the one bad thing, keep going" posture
// gmail's fetchAndTranslate already uses for unparseable messages.
func (s *Service) storeAttachments(ctx context.Context, atts []Attachment) (string, error) {
	if len(atts) == 0 {
		return "[]", nil
	}
	out := make([]Attachment, len(atts))
	for i, a := range atts {
		if a.ID == "" {
			a.ID = newAttachmentID()
		}
		if len(a.Data) > 0 {
			if s.artifacts != nil && int64(len(a.Data)) <= maxAttachmentBytes {
				key := fmt.Sprintf("inbox-attachments/%s", newAttachmentID())
				if _, err := s.artifacts.Put(ctx, key, a.Data, a.ContentType); err == nil {
					a.StorageKey = key
				}
			}
			a.Data = nil
		}
		out[i] = a
	}
	return marshalAttachments(out)
}

func newAttachmentID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("att-%p", &b)
	}
	return hex.EncodeToString(b[:])
}

func parseAttachments(raw string) []Attachment {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var atts []Attachment
	if err := json.Unmarshal([]byte(raw), &atts); err != nil {
		return nil
	}
	return atts
}

func marshalAttachments(atts []Attachment) (string, error) {
	if len(atts) == 0 {
		return "[]", nil
	}
	b, err := json.Marshal(atts)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ─── Threads & messages ─────────────────────────────────────────────────────

// defaultMessagePageSize is the fixed page size for GetThread's message
// history - not client-configurable (unlike thread listing's Limit), to
// keep the new pagination surface area minimal.
const defaultMessagePageSize = 50

func (s *Service) ListThreads(ctx context.Context, principal *backendauth.Principal, params ListThreadsParams) ([]Thread, bool, error) {
	if s == nil || s.threads == nil {
		return nil, false, bkerr.Unavailable("inbox store not configured", nil)
	}
	if principal == nil {
		return nil, false, bkerr.Unauthorized("authentication required", nil)
	}
	records, hasMore, err := s.threads.ListByUserID(ctx, principal.User.ID, params.Status, params.Limit, params.Offset)
	if err != nil {
		return nil, false, bkerr.Internal("list threads", err)
	}
	out := make([]Thread, 0, len(records))
	for _, r := range records {
		t, err := s.hydrateThread(ctx, r)
		if err != nil {
			return nil, false, err
		}
		out = append(out, *t)
	}
	return out, hasMore, nil
}

func (s *Service) GetThread(ctx context.Context, principal *backendauth.Principal, threadID string, msgOffset int) (*Thread, []Message, bool, error) {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return nil, nil, false, bkerr.NotFound("thread not found", err)
	}
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID); err != nil {
		return nil, nil, false, err
	}
	thread, err := s.hydrateThread(ctx, *dbThread)
	if err != nil {
		return nil, nil, false, err
	}
	dbMessages, hasMore, err := s.messages.ListByThreadID(ctx, threadID, defaultMessagePageSize, msgOffset)
	if err != nil {
		return nil, nil, false, bkerr.Internal("list messages", err)
	}
	messages := make([]Message, 0, len(dbMessages))
	for _, m := range dbMessages {
		messages = append(messages, *messageFromDB(m))
	}
	return thread, messages, hasMore, nil
}

func (s *Service) UpdateThreadStatus(ctx context.Context, principal *backendauth.Principal, threadID, status string) error {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return bkerr.NotFound("thread not found", err)
	}
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID); err != nil {
		return err
	}
	return s.threads.UpdateStatus(ctx, threadID, status)
}

// SaveDraft stores a not-yet-sent reply against a thread - the agent's
// draft_reply tool writes here; the human reviews and either edits it or
// calls SendReply, never an automatic send.
func (s *Service) SaveDraft(ctx context.Context, principal *backendauth.Principal, params SendReplyParams) (*Message, error) {
	dbThread, err := s.threads.GetByID(ctx, params.ThreadID)
	if err != nil {
		return nil, bkerr.NotFound("thread not found", err)
	}
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID); err != nil {
		return nil, err
	}
	created, err := s.messages.Create(ctx, db.CreateMessageParams{
		ThreadID:         dbThread.ID,
		ChannelAccountID: dbThread.ChannelAccountID,
		Direction:        MessageDirectionOutbound,
		BodyText:         params.Body,
		IsDraft:          true,
		SentAt:           time.Now(),
	})
	if err != nil {
		return nil, bkerr.Internal("save draft", err)
	}
	return messageFromDB(*created), nil
}

// SendReply delivers a reply through the thread's channel connector, then
// records it as a sent (non-draft) outbound message. Requires an explicit
// call from either the user or the agent after user confirmation - there is
// no path that sends a message without this being invoked directly, which
// is the point: every send is deliberate and traceable.
func (s *Service) SendReply(ctx context.Context, principal *backendauth.Principal, params SendReplyParams) (*Message, error) {
	dbThread, err := s.threads.GetByID(ctx, params.ThreadID)
	if err != nil {
		return nil, bkerr.NotFound("thread not found", err)
	}
	dbAccount, account, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID)
	if err != nil {
		return nil, err
	}
	connector, ok := s.connectors[account.Channel]
	if !ok {
		return nil, bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return nil, bkerr.Internal("load channel account secret", err)
	}
	contact, err := s.contacts.GetByID(ctx, dbThread.ContactID)
	if err != nil {
		return nil, bkerr.Internal("load thread contact", err)
	}

	externalMessageID, err := connector.Send(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	}, dbThread.ExternalThreadID, contact.ExternalID, params.Body)
	if err != nil {
		if isAuthExpired(err) {
			_ = s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusError, authExpiredMessage)
		}
		return nil, bkerr.BadGateway(fmt.Sprintf("send failed for channel %q", account.Channel), err)
	}

	created, err := s.messages.Create(ctx, db.CreateMessageParams{
		ThreadID:          dbThread.ID,
		ChannelAccountID:  dbAccount.ID,
		ExternalMessageID: externalMessageID,
		Direction:         MessageDirectionOutbound,
		SentAt:            time.Now(),
		BodyText:          params.Body,
	})
	if err != nil {
		return nil, bkerr.Internal("record sent message", err)
	}
	if err := s.threads.UpdateStatus(ctx, dbThread.ID, ThreadStatusHandled); err != nil {
		return nil, bkerr.Internal("update thread status", err)
	}
	return messageFromDB(*created), nil
}

// OpenAttachment returns a streaming reader for one message's attachment,
// enforcing the same thread ownership check every other thread-scoped
// method uses. If the attachment's bytes are already cached (StorageKey
// set - always true for WhatsApp, true for Gmail after a first download),
// it streams straight from ArtifactStore. Otherwise (Gmail, first request)
// it fetches via the channel's AttachmentFetcher, caches the result for
// next time, and serves the just-fetched bytes directly - a failure to
// persist the cache doesn't fail the download that already succeeded.
func (s *Service) OpenAttachment(ctx context.Context, principal *backendauth.Principal, threadID, messageID, attachmentID string) (io.ReadCloser, Attachment, error) {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return nil, Attachment{}, bkerr.NotFound("thread not found", err)
	}
	_, account, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID)
	if err != nil {
		return nil, Attachment{}, err
	}

	dbMessage, err := s.messages.GetByID(ctx, messageID)
	if err != nil {
		return nil, Attachment{}, bkerr.NotFound("message not found", err)
	}
	if dbMessage.ThreadID != threadID {
		return nil, Attachment{}, bkerr.NotFound("message not found in this thread", nil)
	}

	atts := parseAttachments(dbMessage.AttachmentsJSON)
	idx := -1
	for i, a := range atts {
		if a.ID == attachmentID {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, Attachment{}, bkerr.NotFound("attachment not found", nil)
	}
	att := atts[idx]

	if att.StorageKey != "" {
		if s.artifacts == nil {
			return nil, Attachment{}, bkerr.Unavailable("blob storage not configured", nil)
		}
		reader, _, err := s.artifacts.OpenReader(ctx, att.StorageKey)
		if err != nil {
			return nil, Attachment{}, bkerr.Internal("open attachment blob", err)
		}
		return reader, att, nil
	}

	// Not cached yet - only Gmail-shaped attachments reach here (WhatsApp
	// always sets StorageKey eagerly at ingest).
	if att.Size > maxAttachmentBytes {
		return nil, Attachment{}, bkerr.TooLarge("attachment is too large to download", nil)
	}
	fetcher, ok := s.connectors[account.Channel].(AttachmentFetcher)
	if !ok {
		return nil, Attachment{}, bkerr.Unavailable(fmt.Sprintf("attachment content is not available for channel %q", account.Channel), nil)
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return nil, Attachment{}, bkerr.Internal("load channel account secret", err)
	}
	data, err := fetcher.FetchAttachment(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	}, dbMessage.ExternalMessageID, att.GmailAttachmentID)
	if err != nil {
		return nil, Attachment{}, bkerr.BadGateway(fmt.Sprintf("fetch attachment failed for channel %q", account.Channel), err)
	}

	if s.artifacts != nil {
		key := fmt.Sprintf("inbox-attachments/%s", newAttachmentID())
		if _, err := s.artifacts.Put(ctx, key, data, att.ContentType); err == nil {
			att.StorageKey = key
			atts[idx] = att
			if updated, err := marshalAttachments(atts); err == nil {
				_ = s.messages.UpdateAttachments(ctx, dbMessage.ID, updated)
			}
		}
	}

	return io.NopCloser(bytes.NewReader(data)), att, nil
}

func (s *Service) SearchContacts(ctx context.Context, principal *backendauth.Principal, channelAccountID, query string, limit int) ([]Contact, error) {
	if _, _, err := s.getOwnedAccountRecord(ctx, principal, channelAccountID); err != nil {
		return nil, err
	}
	records, err := s.contacts.Search(ctx, channelAccountID, query, limit)
	if err != nil {
		return nil, bkerr.Internal("search contacts", err)
	}
	out := make([]Contact, 0, len(records))
	for _, r := range records {
		out = append(out, contactFromDB(r))
	}
	return out, nil
}

// defaultSearchLimit mirrors the per-provider client defaults (Gmail's
// searchMessageLimit, Outlook's searchMessageLimit) so a tool call that
// omits limit still gets a bounded result set at this layer too.
const defaultSearchLimit = 25

// SearchMessages runs a live provider search (see MessageSearcher) against
// one connected channel account and returns the local threads any matches
// belong to - each match is upserted through the normal persistence path
// first (without firing workflows, see persistNormalizedMessage), so a
// found message becomes a real thread the agent can act on afterward with
// GetThread/ArchiveThread/SetThreadReadStatus, not just a one-off search
// result.
func (s *Service) SearchMessages(ctx context.Context, principal *backendauth.Principal, accountID, query string, limit int) ([]Thread, error) {
	if strings.TrimSpace(query) == "" {
		return nil, bkerr.InvalidInput("query is required", nil)
	}
	if limit <= 0 {
		limit = defaultSearchLimit
	}
	_, account, err := s.getOwnedAccountRecord(ctx, principal, accountID)
	if err != nil {
		return nil, err
	}
	conn, ok := s.connectors[account.Channel]
	if !ok {
		return nil, bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}
	searcher, ok := conn.(MessageSearcher)
	if !ok {
		return nil, bkerr.Unavailable(fmt.Sprintf("search is not available for channel %q", account.Channel), nil)
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return nil, bkerr.Internal("load channel account secret", err)
	}

	normalized, err := searcher.SearchMessages(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	}, query, limit)
	if err != nil {
		if isAuthExpired(err) {
			_ = s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusError, authExpiredMessage)
		}
		return nil, bkerr.BadGateway(fmt.Sprintf("search failed for channel %q", account.Channel), err)
	}

	seen := make(map[string]bool, len(normalized))
	out := make([]Thread, 0, len(normalized))
	for _, m := range normalized {
		dbThread, err := s.persistNormalizedMessage(ctx, account.ID, m, false)
		if err != nil || dbThread == nil || seen[dbThread.ID] {
			// A single unpersistable or duplicate-thread hit shouldn't fail
			// the whole search - skip it and keep going, same convention as
			// Connector.Sync's own per-message skip.
			continue
		}
		seen[dbThread.ID] = true
		t, err := s.hydrateThread(ctx, *dbThread)
		if err != nil {
			continue
		}
		out = append(out, *t)
	}
	return out, nil
}

// ArchiveThread moves every message in a thread to the provider's Trash/
// Deleted Items (see ThreadArchiver), then marks the local thread handled -
// the trashed mail needs no further triage attention, the same conclusion
// UpdateThreadStatus(status="handled") already represents, so this doesn't
// introduce a separate "archived" status.
func (s *Service) ArchiveThread(ctx context.Context, principal *backendauth.Principal, threadID string) error {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return bkerr.NotFound("thread not found", err)
	}
	_, account, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID)
	if err != nil {
		return err
	}
	conn, ok := s.connectors[account.Channel]
	if !ok {
		return bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}
	archiver, ok := conn.(ThreadArchiver)
	if !ok {
		return bkerr.Unavailable(fmt.Sprintf("archiving is not available for channel %q", account.Channel), nil)
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return bkerr.Internal("load channel account secret", err)
	}
	if err := archiver.ArchiveThread(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	}, dbThread.ExternalThreadID); err != nil {
		if isAuthExpired(err) {
			_ = s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusError, authExpiredMessage)
		}
		return bkerr.BadGateway(fmt.Sprintf("archive failed for channel %q", account.Channel), err)
	}
	return s.threads.UpdateStatus(ctx, dbThread.ID, ThreadStatusHandled)
}

// SetThreadReadStatus marks every message in a thread read/unread on the
// provider itself (see ThreadReadMarker) - a pure passthrough action, like
// Send; there is no corresponding local read/unread field to update.
func (s *Service) SetThreadReadStatus(ctx context.Context, principal *backendauth.Principal, threadID string, read bool) error {
	dbThread, err := s.threads.GetByID(ctx, threadID)
	if err != nil {
		return bkerr.NotFound("thread not found", err)
	}
	_, account, err := s.getOwnedAccountRecord(ctx, principal, dbThread.ChannelAccountID)
	if err != nil {
		return err
	}
	conn, ok := s.connectors[account.Channel]
	if !ok {
		return bkerr.Unavailable(fmt.Sprintf("no connector registered for channel %q", account.Channel), nil)
	}
	marker, ok := conn.(ThreadReadMarker)
	if !ok {
		return bkerr.Unavailable(fmt.Sprintf("marking read/unread is not available for channel %q", account.Channel), nil)
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil {
		return bkerr.Internal("load channel account secret", err)
	}
	if err := marker.SetThreadRead(ctx, account, ConnectorSecret{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		SessionState: secret.SessionState,
		ExpiresAt:    secret.ExpiresAt,
	}, dbThread.ExternalThreadID, read); err != nil {
		if isAuthExpired(err) {
			_ = s.accounts.UpdateStatus(ctx, account.ID, db.ChannelAccountStatusError, authExpiredMessage)
		}
		return bkerr.BadGateway(fmt.Sprintf("mark read/unread failed for channel %q", account.Channel), err)
	}
	return nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func (s *Service) getOwnedAccount(ctx context.Context, principal *backendauth.Principal, accountID string) (*ChannelAccount, error) {
	_, account, err := s.getOwnedAccountRecord(ctx, principal, accountID)
	return account, err
}

func (s *Service) getOwnedAccountRecord(ctx context.Context, principal *backendauth.Principal, accountID string) (*db.ChannelAccount, *ChannelAccount, error) {
	if principal == nil {
		return nil, nil, bkerr.Unauthorized("authentication required", nil)
	}
	record, err := s.accounts.GetByID(ctx, accountID)
	if err != nil {
		return nil, nil, bkerr.NotFound("channel account not found", err)
	}
	if !principal.HasRole("admin") && record.UserID != principal.User.ID {
		return nil, nil, bkerr.Forbidden("channel account belongs to another user", nil)
	}
	return record, accountFromDB(*record), nil
}

func (s *Service) hydrateThread(ctx context.Context, r db.InboxThread) (*Thread, error) {
	var contact Contact
	if r.ContactID != "" {
		if c, err := s.contacts.GetByID(ctx, r.ContactID); err == nil {
			contact = contactFromDB(*c)
		}
	}
	account, err := s.accounts.GetByID(ctx, r.ChannelAccountID)
	channel := ""
	if err == nil {
		channel = account.Channel
	}
	return &Thread{
		ID:               r.ID,
		ChannelAccountID: r.ChannelAccountID,
		Channel:          channel,
		Contact:          contact,
		Subject:          r.Subject,
		Status:           r.Status,
		PriorityScore:    r.PriorityScore,
		LastMessageAt:    r.LastMessageAt,
		CreatedAt:        r.CreatedAt,
		UpdatedAt:        r.UpdatedAt,
	}, nil
}

func accountFromDB(r db.ChannelAccount) *ChannelAccount {
	return &ChannelAccount{
		ID:                r.ID,
		UserID:            r.UserID,
		WorkspaceID:       r.WorkspaceID,
		Channel:           r.Channel,
		DisplayName:       r.DisplayName,
		ExternalAccountID: r.ExternalAccountID,
		Status:            r.Status,
		HasRefreshToken:   r.HasRefreshToken,
		SyncCursor:        r.SyncCursor,
		LastSyncedAt:      r.LastSyncedAt,
		LastError:         r.LastError,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

func contactFromDB(r db.InboxContact) Contact {
	return Contact{
		ID:          r.ID,
		ExternalID:  r.ExternalID,
		DisplayName: r.DisplayName,
		AvatarURL:   r.AvatarURL,
	}
}

func messageFromDB(r db.InboxMessage) *Message {
	return &Message{
		ID:              r.ID,
		ThreadID:        r.ThreadID,
		Direction:       r.Direction,
		SenderContactID: r.SenderContactID,
		BodyText:        r.BodyText,
		Attachments:     parseAttachments(r.AttachmentsJSON),
		IsDraft:         r.IsDraft,
		SentAt:          r.SentAt,
		CreatedAt:       r.CreatedAt,
	}
}
