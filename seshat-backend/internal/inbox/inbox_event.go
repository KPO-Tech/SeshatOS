package inbox

import "time"

// InboxMessageEventType identifies the "a new inbox message arrived" event
// - the first (and so far only) event type a workflow can trigger on.
const InboxMessageEventType = "inbox.message.received"

// InboxMessageEvent is the canonical shape of an "inbox.message.received"
// event - the fields a workflow's EventFilter expression can reference via
// $event. Deliberately a flat, channel-agnostic shape (works the same for
// Gmail or WhatsApp) rather than embedding a channel-specific message type,
// since the whole point is a condition author (human or the Inbox Agent)
// doesn't need to know which channel a rule applies to unless they choose
// to filter on Channel themselves.
type InboxMessageEvent struct {
	Channel      string // e.g. "gmail", "whatsapp"
	Sender       string // contact display name, falling back to their external ID
	Subject      string // empty for chat-style channels with no subject line
	Body         string // message text
	ThreadStatus string // the thread's status at the time the message arrived (e.g. "open")
	ReceivedAt   time.Time
}

// Payload builds the map EvaluateEventFilter binds as $event. Field names
// are lowerCamelCase to read naturally in a JS-flavored condition
// ($event.subject, not $event.Subject).
func (e InboxMessageEvent) Payload() map[string]any {
	return map[string]any{
		"channel":      e.Channel,
		"sender":       e.Sender,
		"subject":      e.Subject,
		"body":         e.Body,
		"threadStatus": e.ThreadStatus,
		"receivedAt":   e.ReceivedAt.Format(time.RFC3339),
	}
}
