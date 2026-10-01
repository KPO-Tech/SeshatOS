// Package whatsapp implements inbox.Connector for WhatsApp via
// whatsmeow's unofficial multi-device Web protocol - a personal/business
// WhatsApp account paired by QR code, not the official Meta Business Cloud
// API (see the Connector doc comment for why Sync is a no-op here: unlike
// Gmail, this is a push connection, not a poll one).
package whatsapp

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
)

// IngestFunc hands a real-time incoming message to the rest of the app -
// implemented by inbox.Service.IngestMessage in production, swapped for a
// fake in tests.
type IngestFunc func(ctx context.Context, accountID string, msg inbox.NormalizedMessage) error

// StatusFunc records a connection-level problem against an account (e.g. a
// logged-out session detected outside any request) - implemented by
// inbox.Service.MarkAccountError.
type StatusFunc func(ctx context.Context, accountID, status, lastError string) error

const ingestTimeout = 30 * time.Second

// Manager owns every WhatsApp device this process keeps connected. Unlike
// Gmail's Connector, which is stateless between calls, a WhatsApp
// connection is a persistent WebSocket session - Manager is created once
// at startup (see config/bootstrap.go) and lives for the process's
// lifetime, reconnecting every already-paired account and registering an
// event handler per client that pushes messages into inbox.Service as they
// arrive.
type Manager struct {
	container *sqlstore.Container
	ingest    IngestFunc
	setStatus StatusFunc
	log       waLog.Logger

	mu      sync.Mutex
	clients map[string]*whatsmeow.Client // accountID -> live client
}

// NewManager creates a Manager backed by sqlDB - the SAME *sql.DB the rest
// of the app uses (see config/bootstrap.go), so whatsmeow's own session
// tables live in the same physical SQLite file instead of a second one.
// This needs no CGO SQLite driver: whatsmeow's sqlstore only requires a
// *sql.DB and a dialect name, and this app already uses a pure-Go SQLite
// driver everywhere (the desktop build is CGO_ENABLED=0).
func NewManager(ctx context.Context, sqlDB *sql.DB, dialect string, ingest IngestFunc, setStatus StatusFunc) (*Manager, error) {
	log := waLog.Noop
	container := sqlstore.NewWithDB(sqlDB, dialect, log)
	if err := container.Upgrade(ctx); err != nil {
		return nil, fmt.Errorf("upgrade whatsmeow store: %w", err)
	}
	return &Manager{
		container: container,
		ingest:    ingest,
		setStatus: setStatus,
		log:       log,
		clients:   make(map[string]*whatsmeow.Client),
	}, nil
}

// Reconnect loads an already-paired device by its stored JID and starts
// handling its events - called once per connected account at startup.
func (m *Manager) Reconnect(ctx context.Context, accountID, jidStr string) error {
	jid, err := types.ParseJID(jidStr)
	if err != nil {
		return fmt.Errorf("parse jid %q: %w", jidStr, err)
	}
	device, err := m.container.GetDevice(ctx, jid)
	if err != nil {
		return fmt.Errorf("load device: %w", err)
	}
	if device == nil {
		return fmt.Errorf("no stored session for %s - needs re-pairing", jidStr)
	}
	client := whatsmeow.NewClient(device, m.log)
	if err := client.Connect(); err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	m.Adopt(accountID, client)
	return nil
}

// PairedDevice is what a successful QR pairing yields - enough for the
// caller to create the real channel_accounts row (mirrors Gmail's flow:
// the external identity is confirmed before any local account exists).
type PairedDevice struct {
	JID      string
	PushName string
}

// PairNewDevice runs the QR pairing flow for a brand-new WhatsApp
// connection. onQR is called with each QR code to display - WhatsApp
// rotates the code periodically until it's scanned or the flow times out.
// Blocks until pairing succeeds, fails, or ctx is cancelled. The returned
// client is not yet tracked by the Manager - call Adopt once the caller
// has a real accountID to register it under.
func (m *Manager) PairNewDevice(ctx context.Context, onQR func(code string)) (*whatsmeow.Client, PairedDevice, error) {
	device := m.container.NewDevice()
	client := whatsmeow.NewClient(device, m.log)

	qrChan, err := client.GetQRChannel(ctx)
	if err != nil {
		return nil, PairedDevice{}, fmt.Errorf("get qr channel: %w", err)
	}
	if err := client.Connect(); err != nil {
		return nil, PairedDevice{}, fmt.Errorf("connect: %w", err)
	}

	for evt := range qrChan {
		switch evt.Event {
		case whatsmeow.QRChannelEventCode:
			onQR(evt.Code)
		case "success":
			return client, PairedDevice{
				JID:      client.Store.ID.String(),
				PushName: client.Store.PushName,
			}, nil
		case "timeout":
			client.Disconnect()
			return nil, PairedDevice{}, fmt.Errorf("pairing timed out")
		default:
			if evt.Error != nil {
				client.Disconnect()
				return nil, PairedDevice{}, fmt.Errorf("pairing failed: %w", evt.Error)
			}
		}
	}
	return nil, PairedDevice{}, fmt.Errorf("pairing channel closed unexpectedly")
}

// Adopt registers an already-authenticated client (from PairNewDevice or
// Reconnect) under its real accountID and starts handling its events.
func (m *Manager) Adopt(accountID string, client *whatsmeow.Client) {
	client.AddEventHandler(m.handlerFor(accountID, client))
	m.mu.Lock()
	m.clients[accountID] = client
	m.mu.Unlock()
}

// Send delivers a text message to a JID through the account's live
// connection - fails clearly if the account isn't currently connected
// (e.g. session logged out) rather than silently queueing.
func (m *Manager) Send(ctx context.Context, accountID, toJID, body string) (string, error) {
	m.mu.Lock()
	client, ok := m.clients[accountID]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("account %s is not connected", accountID)
	}
	jid, err := types.ParseJID(toJID)
	if err != nil {
		return "", fmt.Errorf("parse jid %q: %w", toJID, err)
	}
	resp, err := client.SendMessage(ctx, jid, &waE2E.Message{Conversation: proto.String(body)})
	if err != nil {
		return "", fmt.Errorf("send message: %w", err)
	}
	return resp.ID, nil
}

// Disconnect drops one account's live connection (e.g. on explicit
// disconnect from the UI) - the paired session itself stays in whatsmeow's
// store, so Reconnect can bring it back without re-pairing.
func (m *Manager) Disconnect(accountID string) {
	m.mu.Lock()
	client, ok := m.clients[accountID]
	if ok {
		delete(m.clients, accountID)
	}
	m.mu.Unlock()
	if ok {
		client.Disconnect()
	}
}

// DisconnectAll drops every live connection - called on process shutdown.
func (m *Manager) DisconnectAll() {
	m.mu.Lock()
	clients := make([]*whatsmeow.Client, 0, len(m.clients))
	for _, c := range m.clients {
		clients = append(clients, c)
	}
	m.clients = make(map[string]*whatsmeow.Client)
	m.mu.Unlock()
	for _, c := range clients {
		c.Disconnect()
	}
}

func (m *Manager) handlerFor(accountID string, client *whatsmeow.Client) whatsmeow.EventHandler {
	return func(raw any) {
		switch evt := raw.(type) {
		case *events.Message:
			// Detached from any request context - message delivery happens
			// on whatsmeow's own background goroutine, well after whatever
			// request (if any) started this connection has already
			// returned. Built before translateIncoming (not after, as
			// before attachment support) since a media download now needs
			// it too.
			ctx, cancel := context.WithTimeout(context.Background(), ingestTimeout)
			defer cancel()
			normalized, ok := translateIncoming(ctx, evt, client)
			if !ok {
				return
			}
			if err := m.ingest(ctx, accountID, normalized); err != nil {
				fmt.Printf("[WhatsApp] ingest failed for account %s: %v\n", accountID, err)
			}
		case *events.LoggedOut:
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if err := m.setStatus(ctx, accountID, inbox.AccountStatusError, "WhatsApp session was logged out - reconnect required"); err != nil {
				fmt.Printf("[WhatsApp] failed to record logout for account %s: %v\n", accountID, err)
			}
			m.mu.Lock()
			delete(m.clients, accountID)
			m.mu.Unlock()
		}
	}
}
