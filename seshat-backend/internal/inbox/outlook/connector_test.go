package outlook

import (
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

func TestConnector_ChannelKindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Channel() != inbox.ChannelOutlook {
		t.Fatalf("expected channel %q, got %q", inbox.ChannelOutlook, c.Channel())
	}
	if c.Kind() != connector.Kind(inbox.ChannelOutlook) {
		t.Fatalf("expected kind %q, got %q", inbox.ChannelOutlook, c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityMessaging {
		t.Fatalf("expected exactly [CapabilityMessaging], got %+v", caps)
	}
}

func TestTranslateMessageMapsFields(t *testing.T) {
	msg := coremsgraph.Message{
		ID:               "m1",
		ConversationID:   "conv1",
		Subject:          "Hello",
		BodyPreview:      "Hi there",
		ReceivedDateTime: "2026-08-20T10:00:00Z",
		From: &coremsgraph.Recipient{EmailAddress: coremsgraph.EmailAddress{
			Address: "alice@example.com", Name: "Alice",
		}},
	}
	n, err := translateMessage(msg)
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.ExternalThreadID != "conv1" || n.ExternalMessageID != "m1" {
		t.Fatalf("expected thread/message ids conv1/m1, got %q/%q", n.ExternalThreadID, n.ExternalMessageID)
	}
	if n.ContactExternalID != "alice@example.com" || n.ContactDisplayName != "Alice" {
		t.Fatalf("expected contact alice@example.com/Alice, got %q/%q", n.ContactExternalID, n.ContactDisplayName)
	}
	if n.Direction != inbox.MessageDirectionInbound {
		t.Fatalf("expected inbound direction, got %q", n.Direction)
	}
	if n.BodyText != "Hi there" {
		t.Fatalf("expected body preview as body text, got %q", n.BodyText)
	}
	if n.SentAt.IsZero() {
		t.Fatal("expected a parsed SentAt")
	}
}

func TestTranslateMessageRejectsUnparseableDate(t *testing.T) {
	if _, err := translateMessage(coremsgraph.Message{ID: "m1", ReceivedDateTime: "not-a-date"}); err == nil {
		t.Fatal("expected an error for an unparseable receivedDateTime")
	}
}
