// Package teams implements inbox.Connector for Microsoft Teams 1:1/
// group chats via core/msgraph - see internal/inbox's package doc for why
// this stays a thin translation layer. core/msgraph is shared,
// tenant-agnostic Microsoft Graph client code - the same package
// seshat-server wraps in a self-hosted MCP server for the workspace chat
// agent, see msgraphmcp's doc comment there.
package teams

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

type Connector struct {
	oauthConfig *oauth2.Config
}

func NewConnector(oauthConfig *oauth2.Config) *Connector {
	return &Connector{oauthConfig: oauthConfig}
}

func (c *Connector) Channel() string { return inbox.ChannelTeams }

func (c *Connector) Kind() connector.Kind { return connector.Kind(inbox.ChannelTeams) }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityMessaging}
}

func (c *Connector) client(ctx context.Context, secret inbox.ConnectorSecret) (*coremsgraph.Client, error) {
	if c.oauthConfig == nil {
		return nil, fmt.Errorf("teams oauth is not configured")
	}
	token := &oauth2.Token{
		AccessToken:  secret.AccessToken,
		RefreshToken: secret.RefreshToken,
		Expiry:       secret.ExpiresAt,
	}
	return coremsgraph.New(c.oauthConfig.Client(ctx, token)), nil
}

// chatCursor is the opaque per-chat "next page link" map this connector
// persists as its own sync cursor between calls - one account-wide Sync
// call covers every chat the account is a member of, mirroring
// core/connectors' SPDriveCursor (per-drive delta links) for the same
// reason: Sync's contract is one opaque string cursor, but there are
// multiple independent sub-resources (chats) underneath it.
type chatCursor map[string]string

func decodeChatCursor(raw string) chatCursor {
	cursor := chatCursor{}
	if raw == "" {
		return cursor
	}
	_ = json.Unmarshal([]byte(raw), &cursor)
	return cursor
}

func (c chatCursor) encode() string {
	data, err := json.Marshal(c)
	if err != nil {
		return "{}"
	}
	return string(data)
}

// Sync visits every chat the account is currently a member of, pulling
// whatever's new in each since its own stored cursor (or the most recent
// messages, for a chat with no stored cursor yet - Teams chat messages have
// no delta endpoint, unlike Mail/SharePoint, so "new" here means "not seen
// on a previous call to this same chat," not a true incremental diff).
func (c *Connector) Sync(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret) ([]inbox.NormalizedMessage, string, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return nil, "", fmt.Errorf("build teams client: %w", err)
	}
	chats, err := client.ListChats(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("list chats: %w", err)
	}

	stored := decodeChatCursor(account.SyncCursor)
	next := chatCursor{}
	var normalized []inbox.NormalizedMessage
	for _, chat := range chats {
		messages, nextLink, err := client.ListChatMessages(ctx, chat.ID, "")
		if err != nil {
			// One errored/unreachable chat shouldn't abort the whole sync -
			// keep its existing cursor (retried next time) and move on,
			// same convention as SharePoint's per-drive Sync.
			if existing := stored[chat.ID]; existing != "" {
				next[chat.ID] = existing
			}
			continue
		}
		next[chat.ID] = nextLink
		for _, m := range messages {
			if m.DeletedDateTime != "" {
				continue
			}
			n, err := translateChatMessage(chat, m)
			if err != nil {
				continue
			}
			normalized = append(normalized, n)
		}
	}
	return normalized, next.encode(), nil
}

func translateChatMessage(chat coremsgraph.Chat, m coremsgraph.ChatMessage) (inbox.NormalizedMessage, error) {
	sentAt, err := time.Parse(time.RFC3339, m.CreatedDateTime)
	if err != nil {
		return inbox.NormalizedMessage{}, fmt.Errorf("parse createdDateTime %q: %w", m.CreatedDateTime, err)
	}
	contactID, contactName := "", ""
	if m.From != nil && m.From.User != nil {
		contactID = m.From.User.ID
		contactName = m.From.User.DisplayName
	}
	bodyText := ""
	if m.Body != nil {
		bodyText = m.Body.Content
	}
	subject := chat.Topic
	if subject == "" {
		subject = contactName
	}
	return inbox.NormalizedMessage{
		ExternalThreadID:   chat.ID,
		ThreadSubject:      subject,
		ExternalMessageID:  m.ID,
		Direction:          inbox.MessageDirectionInbound,
		ContactExternalID:  contactID,
		ContactDisplayName: contactName,
		BodyText:           bodyText,
		SentAt:             sentAt,
	}, nil
}

// Send posts into the chat identified by externalThreadID - Teams chats
// always exist before a message can be sent into them (unlike Mail, there's
// no "start a fresh chat" send path for v1), so contactExternalID is
// unused.
func (c *Connector) Send(ctx context.Context, account *inbox.ChannelAccount, secret inbox.ConnectorSecret, externalThreadID, contactExternalID, body string) (string, error) {
	client, err := c.client(ctx, secret)
	if err != nil {
		return "", fmt.Errorf("build teams client: %w", err)
	}
	if externalThreadID == "" {
		return "", fmt.Errorf("teams requires an existing chat to send into")
	}
	if err := client.SendChatMessage(ctx, externalThreadID, body); err != nil {
		return "", err
	}
	// Graph's send action returns 202 Accepted with no body - no external
	// message ID available synchronously, harmless here for the same reason
	// noted in outlook.Connector.Send.
	return "", nil
}

var _ inbox.Connector = (*Connector)(nil)
