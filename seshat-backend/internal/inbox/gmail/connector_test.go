package gmail

import (
	"testing"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/inbox"
	coregmail "github.com/KPO-Tech/seshat/pkg/gmail"
)

func TestConnector_ChannelKindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Channel() != inbox.ChannelGmail {
		t.Fatalf("expected channel %q, got %q", inbox.ChannelGmail, c.Channel())
	}
	if c.Kind() != connector.Kind(inbox.ChannelGmail) {
		t.Fatalf("expected kind %q, got %q", inbox.ChannelGmail, c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityMessaging {
		t.Fatalf("expected exactly [CapabilityMessaging], got %+v", caps)
	}
}

func TestTranslateMessage_InboundWhenFromIsNotTheAccount(t *testing.T) {
	m := coregmail.Message{
		ID: "m1", ThreadID: "t1", Subject: "Table for 4",
		From:     coregmail.EmailAddress{Address: "jane@example.com", Name: "Jane Client"},
		To:       coregmail.EmailAddress{Address: "owner@restaurant.com"},
		BodyText: "Is there space for 4 tonight?",
		SentAt:   time.UnixMilli(1700000000000),
	}
	n, err := translateMessage(m, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.Direction != inbox.MessageDirectionInbound {
		t.Errorf("expected inbound, got %q", n.Direction)
	}
	if n.ContactExternalID != "jane@example.com" || n.ContactDisplayName != "Jane Client" {
		t.Errorf("expected contact jane@example.com/Jane Client, got %q/%q", n.ContactExternalID, n.ContactDisplayName)
	}
	if n.ExternalThreadID != "t1" || n.ExternalMessageID != "m1" {
		t.Errorf("unexpected IDs: thread=%q message=%q", n.ExternalThreadID, n.ExternalMessageID)
	}
}

func TestTranslateMessage_OutboundDetectedFromAccountEmail(t *testing.T) {
	m := coregmail.Message{
		ID: "m2", ThreadID: "t1",
		From:     coregmail.EmailAddress{Address: "owner@restaurant.com"},
		To:       coregmail.EmailAddress{Address: "jane@example.com"},
		BodyText: "Yes, see you at 8pm!",
	}
	n, err := translateMessage(m, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if n.Direction != inbox.MessageDirectionOutbound {
		t.Errorf("expected outbound, got %q", n.Direction)
	}
	if n.ContactExternalID != "jane@example.com" {
		t.Errorf("expected contact to be the recipient, got %q", n.ContactExternalID)
	}
}

func TestTranslateMessage_RejectsMessageWithNoUsableContact(t *testing.T) {
	m := coregmail.Message{ID: "m3", ThreadID: "t1", BodyText: "orphan"}
	if _, err := translateMessage(m, "owner@restaurant.com"); err == nil {
		t.Fatal("expected an error when neither From nor To can be resolved")
	}
}

func TestTranslateMessage_MapsAttachmentMetadata(t *testing.T) {
	m := coregmail.Message{
		ID: "m4", ThreadID: "t1",
		From: coregmail.EmailAddress{Address: "jane@example.com"},
		Attachments: []coregmail.Attachment{
			{Filename: "invoice.pdf", ContentType: "application/pdf", Size: 12345, GmailAttachmentID: "att-1"},
		},
	}
	n, err := translateMessage(m, "owner@restaurant.com")
	if err != nil {
		t.Fatalf("translateMessage: %v", err)
	}
	if len(n.Attachments) != 1 || n.Attachments[0].GmailAttachmentID != "att-1" {
		t.Fatalf("expected attachment metadata mapped through, got %+v", n.Attachments)
	}
}
