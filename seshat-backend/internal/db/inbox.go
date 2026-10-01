package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Channel identifies which external messaging platform a channel account
// and its threads/messages belong to. Kept as a plain string column (not a
// DB enum) so a new channel never needs a migration to add - see
// internal/inbox's Connector interface for where each channel's actual
// sync/send behavior lives.
const (
	ChannelGmail    = "gmail"
	ChannelOutlook  = "outlook"
	ChannelTeams    = "teams"
	ChannelWhatsApp = "whatsapp"
)

const (
	ChannelAccountStatusPending      = "pending"
	ChannelAccountStatusConnected    = "connected"
	ChannelAccountStatusError        = "error"
	ChannelAccountStatusDisconnected = "disconnected"
)

const (
	InboxThreadStatusOpen      = "open"
	InboxThreadStatusHandled   = "handled"
	InboxThreadStatusSnoozed   = "snoozed"
	InboxThreadStatusEscalated = "escalated"
)

const (
	InboxMessageDirectionInbound  = "inbound"
	InboxMessageDirectionOutbound = "outbound"
)

// gChannelAccount is one connected inbox source (a Gmail mailbox, a
// WhatsApp-linked phone number, ...). OAuth/session secrets are encrypted
// at rest with the same AES-GCM helpers provider_oauth_connections.go
// uses (loadOrCreateEncryptionKey/encryptAESGCM) - reused directly rather
// than duplicated, since they're already package-private to internal/db.
type gChannelAccount struct {
	ID                    string  `gorm:"primaryKey;size:64"`
	UserID                string  `gorm:"column:user_id;size:64;not null;index"`
	WorkspaceID           *string `gorm:"column:workspace_id;size:64;index"`
	Channel               string  `gorm:"column:channel;size:32;not null;index"`
	DisplayName           string  `gorm:"column:display_name;not null;default:''"`
	ExternalAccountID     string  `gorm:"column:external_account_id;not null;default:''"` // e.g. the Gmail address, or the WhatsApp JID
	Status                string  `gorm:"column:status;size:32;not null;default:'pending';index"`
	AccessTokenEncrypted  string  `gorm:"column:access_token_encrypted;not null;default:''"`
	RefreshTokenEncrypted string  `gorm:"column:refresh_token_encrypted;not null;default:''"`
	// SessionStateEncrypted holds a channel-specific opaque connection blob
	// that doesn't fit the OAuth token shape - e.g. WhatsApp's whatsmeow
	// device/session store payload after QR pairing.
	SessionStateEncrypted string `gorm:"column:session_state_encrypted;not null;default:''"`
	Scope                 string `gorm:"column:scope;not null;default:''"`
	ExpiresAtUnix         int64  `gorm:"column:expires_at_unix;not null;default:0"`
	// SyncCursor is opaque per channel (Gmail historyId, Outlook deltaLink,
	// a WhatsApp last-synced timestamp, ...) - the connector that owns this
	// channel is the only thing that interprets it.
	SyncCursor       string `gorm:"column:sync_cursor;not null;default:''"`
	LastSyncedAtUnix int64  `gorm:"column:last_synced_at_unix;not null;default:0"`
	LastError        string `gorm:"column:last_error;not null;default:''"`
	CreatedAtUnix    int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix    int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gChannelAccount) TableName() string { return "channel_accounts" }

// gInboxContact is a lightweight, per-channel-account address book entry -
// deliberately not deduplicated across channels/accounts in this first
// pass (e.g. the same person on Gmail and WhatsApp is two rows); that's
// noted as a future improvement rather than built speculatively now.
type gInboxContact struct {
	ID               string `gorm:"primaryKey;size:64"`
	ChannelAccountID string `gorm:"column:channel_account_id;size:64;not null;index"`
	ExternalID       string `gorm:"column:external_id;not null;default:''"` // email address or phone/JID
	DisplayName      string `gorm:"column:display_name;not null;default:''"`
	AvatarURL        string `gorm:"column:avatar_url;not null;default:''"`
	CreatedAtUnix    int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix    int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gInboxContact) TableName() string { return "inbox_contacts" }

// gInboxThread groups messages the way the source channel does - an email
// thread, or a WhatsApp/Instagram conversation.
type gInboxThread struct {
	ID                string  `gorm:"primaryKey;size:64"`
	ChannelAccountID  string  `gorm:"column:channel_account_id;size:64;not null;index"`
	ExternalThreadID  string  `gorm:"column:external_thread_id;not null;default:'';index"`
	ContactID         string  `gorm:"column:contact_id;size:64;not null;default:''"`
	Subject           string  `gorm:"column:subject;not null;default:''"`
	Status            string  `gorm:"column:status;size:32;not null;default:'open';index"`
	PriorityScore     float64 `gorm:"column:priority_score;not null;default:0"`
	LastMessageAtUnix int64   `gorm:"column:last_message_at_unix;not null;default:0;index"`
	CreatedAtUnix     int64   `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix     int64   `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gInboxThread) TableName() string { return "inbox_threads" }

// gInboxMessage is one message within a thread. AttachmentsJSON is a JSON
// array (filename/content_type/size/storage_key) rather than a relation -
// the same pragmatic pattern gRole uses for MetadataJSON - since
// attachments are always read/written as a whole with their message, never
// queried independently.
type gInboxMessage struct {
	ID                string `gorm:"primaryKey;size:64"`
	ThreadID          string `gorm:"column:thread_id;size:64;not null;index"`
	ChannelAccountID  string `gorm:"column:channel_account_id;size:64;not null;index"`
	ExternalMessageID string `gorm:"column:external_message_id;not null;default:'';index"`
	Direction         string `gorm:"column:direction;size:16;not null"`
	SenderContactID   string `gorm:"column:sender_contact_id;size:64;not null;default:''"`
	BodyText          string `gorm:"column:body_text;type:text;not null;default:''"`
	AttachmentsJSON   string `gorm:"column:attachments_json;type:text;not null;default:'[]'"`
	IsDraft           bool   `gorm:"column:is_draft;not null;default:false"`
	SentAtUnix        int64  `gorm:"column:sent_at_unix;not null;default:0"`
	CreatedAtUnix     int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gInboxMessage) TableName() string { return "inbox_messages" }

// ─── Domain types ───────────────────────────────────────────────────────────

type ChannelAccount struct {
	ID                string
	UserID            string
	WorkspaceID       string
	Channel           string
	DisplayName       string
	ExternalAccountID string
	Status            string
	HasRefreshToken   bool
	Scope             string
	ExpiresAt         time.Time
	SyncCursor        string
	LastSyncedAt      time.Time
	LastError         string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// ChannelAccountSecret is the decrypted connection material a Connector
// needs to talk to the channel - never serialized to API responses.
type ChannelAccountSecret struct {
	AccessToken  string
	RefreshToken string
	SessionState string
	ExpiresAt    time.Time
}

type CreateChannelAccountParams struct {
	UserID            string
	WorkspaceID       string
	Channel           string
	DisplayName       string
	ExternalAccountID string
}

type UpdateChannelAccountConnectedParams struct {
	ID                string
	DisplayName       string
	ExternalAccountID string
	AccessToken       string
	RefreshToken      string
	SessionState      string
	Scope             string
	ExpiresAt         time.Time
}

type UpdateChannelAccountSyncParams struct {
	ID           string
	SyncCursor   string
	LastSyncedAt time.Time
	LastError    string
}

type InboxContact struct {
	ID               string
	ChannelAccountID string
	ExternalID       string
	DisplayName      string
	AvatarURL        string
}

type UpsertContactParams struct {
	ChannelAccountID string
	ExternalID       string
	DisplayName      string
	AvatarURL        string
}

type InboxThread struct {
	ID               string
	ChannelAccountID string
	ExternalThreadID string
	ContactID        string
	Subject          string
	Status           string
	PriorityScore    float64
	LastMessageAt    time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type UpsertThreadParams struct {
	ChannelAccountID string
	ExternalThreadID string
	ContactID        string
	Subject          string
	LastMessageAt    time.Time
}

type InboxMessage struct {
	ID                string
	ThreadID          string
	ChannelAccountID  string
	ExternalMessageID string
	Direction         string
	SenderContactID   string
	BodyText          string
	AttachmentsJSON   string
	IsDraft           bool
	SentAt            time.Time
	CreatedAt         time.Time
}

type CreateMessageParams struct {
	ThreadID          string
	ChannelAccountID  string
	ExternalMessageID string
	Direction         string
	SenderContactID   string
	BodyText          string
	AttachmentsJSON   string
	IsDraft           bool
	SentAt            time.Time
}

// ─── ChannelAccountStore ────────────────────────────────────────────────────

type ChannelAccountStore struct {
	db *DB
}

func NewChannelAccountStore(database *DB) (*ChannelAccountStore, error) {
	if database == nil {
		return nil, fmt.Errorf("channel account store: database is required")
	}
	return &ChannelAccountStore{db: database}, nil
}

func (s *ChannelAccountStore) Create(ctx context.Context, p CreateChannelAccountParams) (*ChannelAccount, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(p.Channel) == "" {
		return nil, fmt.Errorf("channel is required")
	}
	row := gChannelAccount{
		ID:                newIdentityID("chacc"),
		UserID:            p.UserID,
		Channel:           strings.TrimSpace(p.Channel),
		DisplayName:       strings.TrimSpace(p.DisplayName),
		ExternalAccountID: strings.TrimSpace(p.ExternalAccountID),
		Status:            ChannelAccountStatusPending,
	}
	if p.WorkspaceID != "" {
		row.WorkspaceID = &p.WorkspaceID
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create channel account: %w", err)
	}
	return channelAccountFromModel(row), nil
}

func (s *ChannelAccountStore) GetByID(ctx context.Context, id string) (*ChannelAccount, error) {
	var row gChannelAccount
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("channel account not found")
		}
		return nil, err
	}
	return channelAccountFromModel(row), nil
}

// GetByChannelAndExternalID looks up an already-connected account for
// (userID, channel, externalAccountID) - used by inbox.Service.ConnectAccount
// to make reconnecting (e.g. redoing Gmail's OAuth flow after its refresh
// token expired) update the existing row in place instead of creating a
// duplicate. found=false (not an error) means no prior account, a normal
// first-connection outcome.
func (s *ChannelAccountStore) GetByChannelAndExternalID(ctx context.Context, userID, channel, externalAccountID string) (*ChannelAccount, bool, error) {
	var row gChannelAccount
	err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ? AND channel = ? AND external_account_id = ?", userID, channel, externalAccountID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return channelAccountFromModel(row), true, nil
}

func (s *ChannelAccountStore) ListByUserID(ctx context.Context, userID string) ([]ChannelAccount, error) {
	var rows []gChannelAccount
	if err := s.db.GormDB().WithContext(ctx).Where("user_id = ?", userID).Order("created_at_unix asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ChannelAccount, 0, len(rows))
	for _, row := range rows {
		out = append(out, *channelAccountFromModel(row))
	}
	return out, nil
}

// ListByChannelAndStatus lists accounts across every user for one channel -
// unscoped by design, for system-level startup work (e.g. reconnecting
// every already-paired WhatsApp device when the process starts), not for
// any user-facing endpoint.
func (s *ChannelAccountStore) ListByChannelAndStatus(ctx context.Context, channel, status string) ([]ChannelAccount, error) {
	var rows []gChannelAccount
	if err := s.db.GormDB().WithContext(ctx).Where("channel = ? AND status = ?", channel, status).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ChannelAccount, 0, len(rows))
	for _, row := range rows {
		out = append(out, *channelAccountFromModel(row))
	}
	return out, nil
}

func (s *ChannelAccountStore) UpdateConnected(ctx context.Context, p UpdateChannelAccountConnectedParams) (*ChannelAccount, error) {
	accessEnc, err := encryptOptionalSecret(p.AccessToken)
	if err != nil {
		return nil, err
	}
	refreshEnc, err := encryptOptionalSecret(p.RefreshToken)
	if err != nil {
		return nil, err
	}
	sessionEnc, err := encryptOptionalSecret(p.SessionState)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{
		"status":                  ChannelAccountStatusConnected,
		"display_name":            strings.TrimSpace(p.DisplayName),
		"external_account_id":     strings.TrimSpace(p.ExternalAccountID),
		"access_token_encrypted":  accessEnc,
		"refresh_token_encrypted": refreshEnc,
		"session_state_encrypted": sessionEnc,
		"scope":                   strings.TrimSpace(p.Scope),
		"expires_at_unix":         unixOrZero(p.ExpiresAt),
		"last_error":              "",
	}
	if err := s.db.GormDB().WithContext(ctx).Model(&gChannelAccount{}).Where("id = ?", p.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetByID(ctx, p.ID)
}

func (s *ChannelAccountStore) UpdateSyncState(ctx context.Context, p UpdateChannelAccountSyncParams) error {
	updates := map[string]any{
		"sync_cursor":         p.SyncCursor,
		"last_synced_at_unix": unixOrZero(p.LastSyncedAt),
		"last_error":          strings.TrimSpace(p.LastError),
	}
	return s.db.GormDB().WithContext(ctx).Model(&gChannelAccount{}).Where("id = ?", p.ID).Updates(updates).Error
}

func (s *ChannelAccountStore) UpdateStatus(ctx context.Context, id, status, lastError string) error {
	updates := map[string]any{
		"status":     status,
		"last_error": strings.TrimSpace(lastError),
	}
	return s.db.GormDB().WithContext(ctx).Model(&gChannelAccount{}).Where("id = ?", id).Updates(updates).Error
}

func (s *ChannelAccountStore) Delete(ctx context.Context, id string) error {
	return s.db.GormDB().WithContext(ctx).Delete(&gChannelAccount{}, "id = ?", id).Error
}

// GetSecret returns the decrypted connection material for a channel
// account - only ever called from within a Connector's own sync/send path.
func (s *ChannelAccountStore) GetSecret(ctx context.Context, id string) (*ChannelAccountSecret, error) {
	var row gChannelAccount
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("channel account not found")
		}
		return nil, err
	}
	key, err := loadOrCreateEncryptionKey()
	if err != nil {
		return nil, err
	}
	accessToken, err := decryptOptionalSecret(key, row.AccessTokenEncrypted)
	if err != nil {
		return nil, err
	}
	refreshToken, err := decryptOptionalSecret(key, row.RefreshTokenEncrypted)
	if err != nil {
		return nil, err
	}
	sessionState, err := decryptOptionalSecret(key, row.SessionStateEncrypted)
	if err != nil {
		return nil, err
	}
	return &ChannelAccountSecret{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		SessionState: sessionState,
		ExpiresAt:    timeOrZero(row.ExpiresAtUnix),
	}, nil
}

func channelAccountFromModel(row gChannelAccount) *ChannelAccount {
	a := &ChannelAccount{
		ID:                row.ID,
		UserID:            row.UserID,
		Channel:           row.Channel,
		DisplayName:       row.DisplayName,
		ExternalAccountID: row.ExternalAccountID,
		Status:            row.Status,
		HasRefreshToken:   row.RefreshTokenEncrypted != "",
		Scope:             row.Scope,
		ExpiresAt:         timeOrZero(row.ExpiresAtUnix),
		SyncCursor:        row.SyncCursor,
		LastSyncedAt:      timeOrZero(row.LastSyncedAtUnix),
		LastError:         row.LastError,
		CreatedAt:         timeOrZero(row.CreatedAtUnix),
		UpdatedAt:         timeOrZero(row.UpdatedAtUnix),
	}
	if row.WorkspaceID != nil {
		a.WorkspaceID = *row.WorkspaceID
	}
	return a
}

// ─── InboxContactStore ──────────────────────────────────────────────────────

type InboxContactStore struct {
	db *DB
}

func NewInboxContactStore(database *DB) (*InboxContactStore, error) {
	if database == nil {
		return nil, fmt.Errorf("inbox contact store: database is required")
	}
	return &InboxContactStore{db: database}, nil
}

// Upsert finds a contact by (channel_account_id, external_id) or creates
// one, refreshing display name/avatar if they've changed.
func (s *InboxContactStore) Upsert(ctx context.Context, p UpsertContactParams) (*InboxContact, error) {
	if strings.TrimSpace(p.ChannelAccountID) == "" {
		return nil, fmt.Errorf("channel_account_id is required")
	}
	if strings.TrimSpace(p.ExternalID) == "" {
		return nil, fmt.Errorf("external_id is required")
	}
	var existing gInboxContact
	err := s.db.GormDB().WithContext(ctx).
		Where("channel_account_id = ? AND external_id = ?", p.ChannelAccountID, p.ExternalID).
		First(&existing).Error
	if err == nil {
		updates := map[string]any{}
		if p.DisplayName != "" && p.DisplayName != existing.DisplayName {
			updates["display_name"] = p.DisplayName
		}
		if p.AvatarURL != "" && p.AvatarURL != existing.AvatarURL {
			updates["avatar_url"] = p.AvatarURL
		}
		if len(updates) > 0 {
			if err := s.db.GormDB().WithContext(ctx).Model(&gInboxContact{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return nil, err
			}
		}
		return s.GetByID(ctx, existing.ID)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := gInboxContact{
		ID:               newIdentityID("contact"),
		ChannelAccountID: p.ChannelAccountID,
		ExternalID:       p.ExternalID,
		DisplayName:      p.DisplayName,
		AvatarURL:        p.AvatarURL,
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create inbox contact: %w", err)
	}
	return inboxContactFromModel(row), nil
}

func (s *InboxContactStore) GetByID(ctx context.Context, id string) (*InboxContact, error) {
	var row gInboxContact
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("inbox contact not found")
		}
		return nil, err
	}
	return inboxContactFromModel(row), nil
}

func (s *InboxContactStore) Search(ctx context.Context, channelAccountID, query string, limit int) ([]InboxContact, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	q := s.db.GormDB().WithContext(ctx).Where("channel_account_id = ?", channelAccountID)
	if strings.TrimSpace(query) != "" {
		like := "%" + strings.TrimSpace(query) + "%"
		q = q.Where("display_name LIKE ? OR external_id LIKE ?", like, like)
	}
	var rows []gInboxContact
	if err := q.Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]InboxContact, 0, len(rows))
	for _, row := range rows {
		out = append(out, *inboxContactFromModel(row))
	}
	return out, nil
}

func inboxContactFromModel(row gInboxContact) *InboxContact {
	return &InboxContact{
		ID:               row.ID,
		ChannelAccountID: row.ChannelAccountID,
		ExternalID:       row.ExternalID,
		DisplayName:      row.DisplayName,
		AvatarURL:        row.AvatarURL,
	}
}

// ─── InboxThreadStore ───────────────────────────────────────────────────────

type InboxThreadStore struct {
	db *DB
}

func NewInboxThreadStore(database *DB) (*InboxThreadStore, error) {
	if database == nil {
		return nil, fmt.Errorf("inbox thread store: database is required")
	}
	return &InboxThreadStore{db: database}, nil
}

// Upsert finds a thread by (channel_account_id, external_thread_id) or
// creates one - the unit of work a channel sync loop calls once per thread
// it observes, before appending that thread's messages.
func (s *InboxThreadStore) Upsert(ctx context.Context, p UpsertThreadParams) (*InboxThread, error) {
	if strings.TrimSpace(p.ChannelAccountID) == "" {
		return nil, fmt.Errorf("channel_account_id is required")
	}
	if strings.TrimSpace(p.ExternalThreadID) == "" {
		return nil, fmt.Errorf("external_thread_id is required")
	}
	var existing gInboxThread
	err := s.db.GormDB().WithContext(ctx).
		Where("channel_account_id = ? AND external_thread_id = ?", p.ChannelAccountID, p.ExternalThreadID).
		First(&existing).Error
	if err == nil {
		updates := map[string]any{}
		if p.Subject != "" && p.Subject != existing.Subject {
			updates["subject"] = p.Subject
		}
		if !p.LastMessageAt.IsZero() && unixOrZero(p.LastMessageAt) > existing.LastMessageAtUnix {
			updates["last_message_at_unix"] = unixOrZero(p.LastMessageAt)
			// A new message reopens a thread that was previously handled -
			// snoozed/escalated are left alone, those are deliberate states
			// a human or the agent chose, not something a new inbound
			// message should silently override.
			if existing.Status == InboxThreadStatusHandled {
				updates["status"] = InboxThreadStatusOpen
			}
		}
		if len(updates) > 0 {
			if err := s.db.GormDB().WithContext(ctx).Model(&gInboxThread{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return nil, err
			}
		}
		return s.GetByID(ctx, existing.ID)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	row := gInboxThread{
		ID:                newIdentityID("thread"),
		ChannelAccountID:  p.ChannelAccountID,
		ExternalThreadID:  p.ExternalThreadID,
		ContactID:         p.ContactID,
		Subject:           p.Subject,
		Status:            InboxThreadStatusOpen,
		LastMessageAtUnix: unixOrZero(p.LastMessageAt),
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create inbox thread: %w", err)
	}
	return inboxThreadFromModel(row), nil
}

func (s *InboxThreadStore) GetByID(ctx context.Context, id string) (*InboxThread, error) {
	var row gInboxThread
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("inbox thread not found")
		}
		return nil, err
	}
	return inboxThreadFromModel(row), nil
}

// ListByUserID lists threads across every channel account the user owns,
// most recently active first - status/limit let the UI ask for e.g. only
// "open" threads. offset pages past earlier results; hasMore reports
// whether there are more rows beyond the returned page (computed exactly,
// by fetching one extra row and trimming, rather than guessed from "got a
// full page").
func (s *InboxThreadStore) ListByUserID(ctx context.Context, userID string, status string, limit, offset int) (threads []InboxThread, hasMore bool, err error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	q := s.db.GormDB().WithContext(ctx).
		Table("inbox_threads").
		Joins("JOIN channel_accounts ON channel_accounts.id = inbox_threads.channel_account_id").
		Where("channel_accounts.user_id = ?", userID)
	if status != "" {
		q = q.Where("inbox_threads.status = ?", status)
	}
	var rows []gInboxThread
	if err := q.Order("inbox_threads.last_message_at_unix DESC").Limit(limit + 1).Offset(offset).Find(&rows).Error; err != nil {
		return nil, false, err
	}
	hasMore = len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	out := make([]InboxThread, 0, len(rows))
	for _, row := range rows {
		out = append(out, *inboxThreadFromModel(row))
	}
	return out, hasMore, nil
}

func (s *InboxThreadStore) UpdateStatus(ctx context.Context, id, status string) error {
	return s.db.GormDB().WithContext(ctx).Model(&gInboxThread{}).Where("id = ?", id).Update("status", status).Error
}

func (s *InboxThreadStore) UpdatePriority(ctx context.Context, id string, score float64) error {
	return s.db.GormDB().WithContext(ctx).Model(&gInboxThread{}).Where("id = ?", id).Update("priority_score", score).Error
}

func inboxThreadFromModel(row gInboxThread) *InboxThread {
	return &InboxThread{
		ID:               row.ID,
		ChannelAccountID: row.ChannelAccountID,
		ExternalThreadID: row.ExternalThreadID,
		ContactID:        row.ContactID,
		Subject:          row.Subject,
		Status:           row.Status,
		PriorityScore:    row.PriorityScore,
		LastMessageAt:    timeOrZero(row.LastMessageAtUnix),
		CreatedAt:        timeOrZero(row.CreatedAtUnix),
		UpdatedAt:        timeOrZero(row.UpdatedAtUnix),
	}
}

// ─── InboxMessageStore ──────────────────────────────────────────────────────

type InboxMessageStore struct {
	db *DB
}

func NewInboxMessageStore(database *DB) (*InboxMessageStore, error) {
	if database == nil {
		return nil, fmt.Errorf("inbox message store: database is required")
	}
	return &InboxMessageStore{db: database}, nil
}

// Create is idempotent per (thread_id, external_message_id) - a sync loop
// can safely re-observe the same message across runs (e.g. after a cursor
// reset) without duplicating it.
func (s *InboxMessageStore) Create(ctx context.Context, p CreateMessageParams) (*InboxMessage, error) {
	if strings.TrimSpace(p.ThreadID) == "" {
		return nil, fmt.Errorf("thread_id is required")
	}
	if strings.TrimSpace(p.Direction) == "" {
		return nil, fmt.Errorf("direction is required")
	}
	if p.ExternalMessageID != "" {
		var existing gInboxMessage
		err := s.db.GormDB().WithContext(ctx).
			Where("thread_id = ? AND external_message_id = ?", p.ThreadID, p.ExternalMessageID).
			First(&existing).Error
		if err == nil {
			return inboxMessageFromModel(existing), nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	attachments := p.AttachmentsJSON
	if attachments == "" {
		attachments = "[]"
	}
	row := gInboxMessage{
		ID:                newIdentityID("msg"),
		ThreadID:          p.ThreadID,
		ChannelAccountID:  p.ChannelAccountID,
		ExternalMessageID: p.ExternalMessageID,
		Direction:         p.Direction,
		SenderContactID:   p.SenderContactID,
		BodyText:          p.BodyText,
		AttachmentsJSON:   attachments,
		IsDraft:           p.IsDraft,
		SentAtUnix:        unixOrZero(p.SentAt),
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create inbox message: %w", err)
	}
	return inboxMessageFromModel(row), nil
}

// ListByThreadID pages backward through a thread's messages, newest first
// internally (offset 0 = the most recent limit messages), then returns them
// reversed to the ascending order every existing consumer expects. offset
// advances further into history for a "load earlier messages" UI; hasMore
// reports whether older messages remain beyond the returned page.
func (s *InboxMessageStore) ListByThreadID(ctx context.Context, threadID string, limit, offset int) (messages []InboxMessage, hasMore bool, err error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	var rows []gInboxMessage
	if err := s.db.GormDB().WithContext(ctx).
		Where("thread_id = ?", threadID).
		Order("sent_at_unix desc, created_at_unix desc").
		Limit(limit + 1).Offset(offset).
		Find(&rows).Error; err != nil {
		return nil, false, err
	}
	hasMore = len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	out := make([]InboxMessage, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		out = append(out, *inboxMessageFromModel(rows[i]))
	}
	return out, hasMore, nil
}

func (s *InboxMessageStore) DeleteDraft(ctx context.Context, id string) error {
	return s.db.GormDB().WithContext(ctx).Delete(&gInboxMessage{}, "id = ? AND is_draft = ?", id, true).Error
}

func (s *InboxMessageStore) GetByID(ctx context.Context, id string) (*InboxMessage, error) {
	var row gInboxMessage
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("inbox message not found")
		}
		return nil, err
	}
	return inboxMessageFromModel(row), nil
}

// UpdateAttachments overwrites a message's attachments_json - used after a
// lazily-fetched attachment's bytes are cached in ArtifactStore, so the
// StorageKey is persisted and a later download skips re-fetching from the
// external channel (see inbox.Service.OpenAttachment).
func (s *InboxMessageStore) UpdateAttachments(ctx context.Context, id, attachmentsJSON string) error {
	return s.db.GormDB().WithContext(ctx).Model(&gInboxMessage{}).Where("id = ?", id).Update("attachments_json", attachmentsJSON).Error
}

func inboxMessageFromModel(row gInboxMessage) *InboxMessage {
	return &InboxMessage{
		ID:                row.ID,
		ThreadID:          row.ThreadID,
		ChannelAccountID:  row.ChannelAccountID,
		ExternalMessageID: row.ExternalMessageID,
		Direction:         row.Direction,
		SenderContactID:   row.SenderContactID,
		BodyText:          row.BodyText,
		AttachmentsJSON:   row.AttachmentsJSON,
		IsDraft:           row.IsDraft,
		SentAt:            timeOrZero(row.SentAtUnix),
		CreatedAt:         timeOrZero(row.CreatedAtUnix),
	}
}
