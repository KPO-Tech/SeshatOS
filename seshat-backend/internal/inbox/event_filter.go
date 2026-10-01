package inbox

import (
	"fmt"

	"github.com/dop251/goja"
)

// EvaluateEventFilter compiles and runs filter as a goja boolean expression
// against payload, exposed to the expression as a single "$event" object
// (e.g. "$event.subject.includes('invoice')") - the same "$"-prefixed
// convention n8n/m9m use for their own expression context, so a condition
// reads the same way workflow authors (or an LLM authoring one, per the
// Inbox Agent use case this exists for) already expect. See
// InboxMessageEvent.Payload for the canonical shape an inbox-message filter
// can reference.
//
// An empty filter always matches, without spinning up a goja runtime - most
// workflows fire unconditionally on their event type, and letting that stay
// cheap keeps a busy inbox sync from paying interpreter overhead per
// message for jobs that don't filter.
//
// The filter must evaluate to a boolean; any other result type is treated
// as a configuration error rather than silently coerced, so a malformed
// condition fails loudly when the workflow is created/tested instead of
// silently never firing.
func EvaluateEventFilter(filter string, payload map[string]any) (bool, error) {
	if filter == "" {
		return true, nil
	}

	vm := goja.New()
	if err := vm.Set("$event", payload); err != nil {
		return false, fmt.Errorf("bind event payload into filter scope: %w", err)
	}

	result, err := vm.RunString(filter)
	if err != nil {
		return false, fmt.Errorf("evaluate filter: %w", err)
	}

	matched, ok := result.Export().(bool)
	if !ok {
		return false, fmt.Errorf("filter must evaluate to a boolean, got %T", result.Export())
	}
	return matched, nil
}
