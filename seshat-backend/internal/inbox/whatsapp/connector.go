package whatsapp

import (
	"context"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
)

// Connector adapts a Manager to inbox.Connector. Sync is intentionally a
// no-op: WhatsApp messages arrive in real time through the Manager's own
// event handlers (see manager.go's handlerFor, wired via Reconnect/Adopt),
// not by being polled - there is nothing for SyncAccount to pull. Send is
// the only place this connector actually does channel work.
type Connector struct {
	manager *Manager
}

func NewConnector(manager *Manager) *Connector {
	return &Connector{manager: manager}
}

func (c *Connector) Channel() string { return inbox.ChannelWhatsApp }

func (c *Connector) Kind() connector.Kind { return connector.Kind(inbox.ChannelWhatsApp) }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityMessaging}
}

func (c *Connector) Sync(_ context.Context, account *inbox.ChannelAccount, _ inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	return nil, account.SyncCursor, nil
}

// Send delivers a message to a WhatsApp JID. externalThreadID is unused -
// for WhatsApp's 1:1-only v1 scope, the thread IS the contact's JID (see
// translateIncoming), so contactExternalID alone is enough to address the
// send.
func (c *Connector) Send(ctx context.Context, account *inbox.ChannelAccount, _ inbox.ConnectorSecret, _ string, contactExternalID, body string) (string, error) {
	return c.manager.Send(ctx, account.ID, contactExternalID, body)
}

var _ inbox.Connector = (*Connector)(nil)
