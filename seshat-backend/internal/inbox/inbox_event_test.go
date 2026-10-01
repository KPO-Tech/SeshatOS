package inbox

import (
	"testing"
	"time"
)

func TestInboxMessageEventPayloadShape(t *testing.T) {
	receivedAt := time.Date(2026, 8, 31, 12, 0, 0, 0, time.UTC)
	event := InboxMessageEvent{
		Channel:      "whatsapp",
		Sender:       "Jane Doe",
		Subject:      "",
		Body:         "Can you send the invoice?",
		ThreadStatus: "open",
		ReceivedAt:   receivedAt,
	}
	payload := event.Payload()

	want := map[string]any{
		"channel":      "whatsapp",
		"sender":       "Jane Doe",
		"subject":      "",
		"body":         "Can you send the invoice?",
		"threadStatus": "open",
		"receivedAt":   receivedAt.Format(time.RFC3339),
	}
	for key, wantVal := range want {
		gotVal, ok := payload[key]
		if !ok {
			t.Fatalf("payload missing key %q", key)
		}
		if gotVal != wantVal {
			t.Errorf("payload[%q] = %v, want %v", key, gotVal, wantVal)
		}
	}
	if len(payload) != len(want) {
		t.Errorf("payload has %d keys, want %d (unexpected extra keys: %v)", len(payload), len(want), payload)
	}
}
