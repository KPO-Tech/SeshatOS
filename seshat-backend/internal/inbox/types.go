package inbox

import (
	"context"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// Aliased from internal/db rather than redeclared, so the two can never
// silently drift apart (a rename in db/inbox.go breaks this at compile
// time instead of just here at runtime) - db owns the canonical values
// since they're persisted column values, and this package re-exports them
// under its own name so callers (tools, API handlers) don't need to import
// internal/db just for a status string.
const (
	ChannelGmail    = db.ChannelGmail
	ChannelOutlook  = db.ChannelOutlook
	ChannelTeams    = db.ChannelTeams
	ChannelWhatsApp = db.ChannelWhatsApp

	AccountStatusPending      = db.ChannelAccountStatusPending
	AccountStatusConnected    = db.ChannelAccountStatusConnected
	AccountStatusError        = db.ChannelAccountStatusError
	AccountStatusDisconnected = db.ChannelAccountStatusDisconnected

	ThreadStatusOpen      = db.InboxThreadStatusOpen
	ThreadStatusHandled   = db.InboxThreadStatusHandled
	ThreadStatusSnoozed   = db.InboxThreadStatusSnoozed
	ThreadStatusEscalated = db.InboxThreadStatusEscalated

	MessageDirectionInbound  = db.InboxMessageDirectionInbound
	MessageDirectionOutbound = db.InboxMessageDirectionOutbound
)

type ChannelAccount struct {
	ID                string    `json:"id"`
	UserID            string    `json:"user_id"`
	WorkspaceID       string    `json:"workspace_id,omitempty"`
	Channel           string    `json:"channel"`
	DisplayName       string    `json:"display_name"`
	ExternalAccountID string    `json:"external_account_id"`
	Status            string    `json:"status"`
	HasRefreshToken   bool      `json:"has_refresh_token"`
	SyncCursor        string    `json:"-"`
	LastSyncedAt      time.Time `json:"last_synced_at,omitempty"`
	LastError         string    `json:"last_error,omitempty"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type Contact struct {
	ID          string `json:"id"`
	ExternalID  string `json:"external_id"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url,omitempty"`
}

type Thread struct {
	ID               string    `json:"id"`
	ChannelAccountID string    `json:"channel_account_id"`
	Channel          string    `json:"channel"`
	Contact          Contact   `json:"contact"`
	Subject          string    `json:"subject,omitempty"`
	Status           string    `json:"status"`
	PriorityScore    float64   `json:"priority_score"`
	LastMessageAt    time.Time `json:"last_message_at"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type Message struct {
	ID              string       `json:"id"`
	ThreadID        string       `json:"thread_id"`
	Direction       string       `json:"direction"`
	SenderContactID string       `json:"sender_contact_id,omitempty"`
	BodyText        string       `json:"body_text"`
	Attachments     []Attachment `json:"attachments,omitempty"`
	IsDraft         bool         `json:"is_draft"`
	SentAt          time.Time    `json:"sent_at"`
	CreatedAt       time.Time    `json:"created_at"`
}

// Attachment is one file attached to a message. Metadata (Filename/
// ContentType/Size) is always populated by the connector that observed it;
// StorageKey is set once the bytes are cached in ArtifactStore - either
// immediately (WhatsApp, which downloads eagerly at ingest, see
// internal/inbox/whatsapp's package doc) or lazily, on first download
// request (Gmail, whose GmailAttachmentID stays valid indefinitely via the
// API, so eager download would waste bandwidth on attachments nobody ever
// opens - see Service.OpenAttachment).
type Attachment struct {
	ID                string `json:"id"`
	Filename          string `json:"filename"`
	ContentType       string `json:"content_type"`
	Size              int64  `json:"size"`
	StorageKey        string `json:"storage_key,omitempty"`
	GmailAttachmentID string `json:"gmail_attachment_id,omitempty"`
	// Data is transient - only ever set in-flight by a connector that
	// already has the bytes in hand (WhatsApp's ingest path). Service
	// stores it via ArtifactStore and clears this field before the
	// attachment is ever marshaled to JSON for persistence; never read back
	// from a persisted row.
	Data []byte `json:"-"`
}

type ConnectAccountParams struct {
	WorkspaceID       string
	Channel           string
	DisplayName       string
	ExternalAccountID string
	AccessToken       string
	RefreshToken      string
	SessionState      string
	Scope             string
	ExpiresAt         time.Time
}

type ListThreadsParams struct {
	Status string
	Limit  int
	Offset int
}

type SendReplyParams struct {
	ThreadID string
	Body     string
}

// NormalizedMessage is what a Connector's Sync returns for each message it
// observed on the external channel. Persisting it (upserting the contact
// and thread, creating the message row, and applying the thread-reopen
// rule) is the Service's job, not the connector's - that keeps sync
// persistence logic in exactly one place regardless of how many channels
// exist, instead of duplicated per connector.
type NormalizedMessage struct {
	ExternalThreadID string
	// ThreadSubject is only meaningful for channels with a real subject
	// line (email); leave empty for chat-style channels like WhatsApp,
	// where the thread is just "the conversation with this contact".
	ThreadSubject      string
	ExternalMessageID  string
	Direction          string
	ContactExternalID  string
	ContactDisplayName string
	ContactAvatarURL   string
	BodyText           string
	Attachments        []Attachment
	SentAt             time.Time
}

// Connector is what a channel implementation (Gmail, WhatsApp, ...) provides.
// It never touches the database directly - Sync returns normalized data for
// the Service to persist, and Send only needs enough identity to address the
// external API, not local row IDs.
//
// Embeds connector.Connector (Kind/Capabilities) - the shared base contract
// every connector implements regardless of domain, generalized out of what
// used to be this messaging-only interface (see internal/connector's doc
// comment and helps/roadmap.md Phase 1). Channel() is kept alongside Kind()
// deliberately rather than replaced by it: it's the string persisted on
// every ChannelAccount/message row and threaded through the whole existing
// schema/API, so replacing it here would ripple far beyond this interface.
type Connector interface {
	connector.Connector

	Channel() string

	// Sync pulls everything new since account.SyncCursor and returns it
	// normalized, plus the cursor value to persist for next time (opaque -
	// only this connector interprets it, e.g. a Gmail historyId or a
	// last-seen WhatsApp timestamp).
	Sync(ctx context.Context, account *ChannelAccount, secret ConnectorSecret) (messages []NormalizedMessage, nextCursor string, err error)

	// Send delivers an outbound message to a contact/thread on the external
	// channel and returns that channel's own message ID (stored so a later
	// Sync recognizes and skips this message rather than re-importing it as
	// a duplicate inbound one).
	Send(ctx context.Context, account *ChannelAccount, secret ConnectorSecret, externalThreadID, contactExternalID, body string) (externalMessageID string, err error)
}

// AttachmentFetcher is implemented by a Connector whose attachments aren't
// downloaded at ingest time (see Attachment's doc comment on eager vs. lazy
// fetching) - Service.OpenAttachment calls this on the first download
// request for an attachment whose StorageKey is still empty, then caches
// the result so later requests skip the external API entirely.
type AttachmentFetcher interface {
	FetchAttachment(ctx context.Context, account *ChannelAccount, secret ConnectorSecret, externalMessageID, attachmentRef string) (data []byte, err error)
}

// MessageSearcher is implemented by a Connector whose provider supports a
// live search over the external mailbox, not just what's already synced
// locally (e.g. Gmail's search operators, Outlook's $search) - Service
// type-asserts for it the same way OpenAttachment type-asserts for
// AttachmentFetcher. A found message flows through the same upsert path
// Sync uses (so it becomes a real, browsable local thread the agent can act
// on with inbox_get_thread/inbox_archive_thread afterward), but never fires
// event-triggered workflows - a search hit isn't a newly-arrived message.
type MessageSearcher interface {
	SearchMessages(ctx context.Context, account *ChannelAccount, secret ConnectorSecret, query string, maxResults int) ([]NormalizedMessage, error)
}

// ThreadArchiver is implemented by a Connector whose provider has a
// removable-from-inbox concept (Gmail Trash, Outlook Deleted Items).
// ArchiveThread acts on every message in the thread as a unit, addressed by
// externalThreadID (the same identifier Connector.Send's externalThreadID
// param already uses) rather than per-message IDs, since Gmail has a real
// thread-level primitive and Outlook's connector can enumerate the
// conversation itself. One-way: both providers keep trashed mail for a
// retention window, but there is no corresponding "unarchive" tool yet.
type ThreadArchiver interface {
	ArchiveThread(ctx context.Context, account *ChannelAccount, secret ConnectorSecret, externalThreadID string) error
}

// ThreadReadMarker is implemented by a Connector whose provider tracks
// read/unread state, applied to every message in the thread.
type ThreadReadMarker interface {
	SetThreadRead(ctx context.Context, account *ChannelAccount, secret ConnectorSecret, externalThreadID string, read bool) error
}

// ConnectorSecret is the decrypted connection material a Connector needs -
// never logged, never serialized to an API response.
type ConnectorSecret struct {
	AccessToken  string
	RefreshToken string
	SessionState string
	ExpiresAt    time.Time
}
