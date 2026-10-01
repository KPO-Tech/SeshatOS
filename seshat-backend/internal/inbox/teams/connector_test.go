package teams

import (
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/inbox"
	coremsgraph "github.com/KPO-Tech/seshat/pkg/msgraph"
)

func TestConnector_ChannelKindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Channel() != inbox.ChannelTeams {
		t.Fatalf("expected channel %q, got %q", inbox.ChannelTeams, c.Channel())
	}
	if c.Kind() != connector.Kind(inbox.ChannelTeams) {
		t.Fatalf("expected kind %q, got %q", inbox.ChannelTeams, c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityMessaging {
		t.Fatalf("expected exactly [CapabilityMessaging], got %+v", caps)
	}
}

func TestTranslateChatMessageMapsFields(t *testing.T) {
	chat := coremsgraph.Chat{ID: "c1", Topic: "Project X"}
	msg := coremsgraph.ChatMessage{
		ID:              "msg1",
		CreatedDateTime: "2026-08-20T10:00:00Z",
		Body:            &coremsgraph.MessageBody{Content: "hello team"},
		From: &coremsgraph.ChatMessageFrom{User: &coremsgraph.ChatMessageUser{
			ID: "u1", DisplayName: "Bob",
		}},
	}
	n, err := translateChatMessage(chat, msg)
	if err != nil {
		t.Fatalf("translateChatMessage: %v", err)
	}
	if n.ExternalThreadID != "c1" || n.ExternalMessageID != "msg1" {
		t.Fatalf("expected thread/message ids c1/msg1, got %q/%q", n.ExternalThreadID, n.ExternalMessageID)
	}
	if n.ThreadSubject != "Project X" {
		t.Fatalf("expected chat topic as thread subject, got %q", n.ThreadSubject)
	}
	if n.ContactExternalID != "u1" || n.ContactDisplayName != "Bob" {
		t.Fatalf("expected contact u1/Bob, got %q/%q", n.ContactExternalID, n.ContactDisplayName)
	}
	if n.BodyText != "hello team" {
		t.Fatalf("expected body content, got %q", n.BodyText)
	}
}

func TestTranslateChatMessageFallsBackToContactNameWhenNoTopic(t *testing.T) {
	chat := coremsgraph.Chat{ID: "c1"}
	msg := coremsgraph.ChatMessage{
		ID:              "msg1",
		CreatedDateTime: "2026-08-20T10:00:00Z",
		From:            &coremsgraph.ChatMessageFrom{User: &coremsgraph.ChatMessageUser{DisplayName: "Bob"}},
	}
	n, err := translateChatMessage(chat, msg)
	if err != nil {
		t.Fatalf("translateChatMessage: %v", err)
	}
	if n.ThreadSubject != "Bob" {
		t.Fatalf("expected the contact's display name as a fallback subject, got %q", n.ThreadSubject)
	}
}

func TestChatCursorRoundTrips(t *testing.T) {
	cursor := chatCursor{"chat1": "link1", "chat2": "link2"}
	decoded := decodeChatCursor(cursor.encode())
	if decoded["chat1"] != "link1" || decoded["chat2"] != "link2" {
		t.Fatalf("expected round-tripped cursor, got %+v", decoded)
	}
}

func TestDecodeChatCursorHandlesEmptyAndInvalidInput(t *testing.T) {
	if c := decodeChatCursor(""); len(c) != 0 {
		t.Fatalf("expected an empty cursor for empty input, got %+v", c)
	}
	if c := decodeChatCursor("not json"); len(c) != 0 {
		t.Fatalf("expected an empty cursor for invalid input, got %+v", c)
	}
}
