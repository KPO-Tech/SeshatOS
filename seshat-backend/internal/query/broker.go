package query

import (
	"sync"

	"github.com/KPO-Tech/seshat/pkg/types"
)

// BrokerResolveResult is the outcome of a broker resolve call.
type BrokerResolveResult int

const (
	BrokerResolveNotFound  BrokerResolveResult = iota
	BrokerResolveForbidden BrokerResolveResult = iota
	BrokerResolveResolved  BrokerResolveResult = iota
)

// PermissionDecision carries a human's approve/deny choice for a pending
// tool-permission request, plus an optional explanation. Reason is only
// meaningful when Approved is false: it flows back to the model as the
// denied tool call's result text. Remember is only meaningful when Approved
// is true ("Always Allow" instead of "Allow once") - see query.go's promptFn
// closure, which turns it into the magic "always" PromptResponse.Value the
// permission Integrator's ResolverWithContext recognizes to persist a
// session-scoped approval (internal/permissions/integration.go).
type PermissionDecision struct {
	Approved bool
	Remember bool
	Reason   string
}

// PermissionBroker bridges tool-approval SSE events to their pending permission channels.
type PermissionBroker struct {
	mu      sync.Mutex
	pending map[string]pendingPermission
}

type pendingPermission struct {
	userID    string
	sessionID string
	ch        chan PermissionDecision
}

func NewPermissionBroker() *PermissionBroker {
	return &PermissionBroker{pending: make(map[string]pendingPermission)}
}

func (b *PermissionBroker) Await(id, userID, sessionID string) chan PermissionDecision {
	ch := make(chan PermissionDecision, 1)
	b.mu.Lock()
	b.pending[id] = pendingPermission{userID: userID, sessionID: sessionID, ch: ch}
	b.mu.Unlock()
	return ch
}

func (b *PermissionBroker) Cancel(id string) {
	b.mu.Lock()
	delete(b.pending, id)
	b.mu.Unlock()
}

func (b *PermissionBroker) Resolve(id, userID, sessionID string, approved bool, remember bool, reason string) BrokerResolveResult {
	b.mu.Lock()
	pending, ok := b.pending[id]
	if !ok {
		b.mu.Unlock()
		return BrokerResolveNotFound
	}
	if !matchesPendingScope(pending.userID, pending.sessionID, userID, sessionID) {
		b.mu.Unlock()
		return BrokerResolveForbidden
	}
	delete(b.pending, id)
	b.mu.Unlock()
	pending.ch <- PermissionDecision{Approved: approved, Remember: remember, Reason: reason}
	return BrokerResolveResolved
}

// PromptBroker bridges prompt-required SSE events to their pending prompt channels.
type PromptBroker struct {
	mu      sync.Mutex
	pending map[string]pendingPrompt
}

type pendingPrompt struct {
	userID    string
	sessionID string
	ch        chan types.PromptResponse
}

func NewPromptBroker() *PromptBroker {
	return &PromptBroker{pending: make(map[string]pendingPrompt)}
}

func (b *PromptBroker) Await(id, userID, sessionID string) chan types.PromptResponse {
	ch := make(chan types.PromptResponse, 1)
	b.mu.Lock()
	b.pending[id] = pendingPrompt{userID: userID, sessionID: sessionID, ch: ch}
	b.mu.Unlock()
	return ch
}

func (b *PromptBroker) Cancel(id string) {
	b.mu.Lock()
	delete(b.pending, id)
	b.mu.Unlock()
}

func (b *PromptBroker) Resolve(id, userID, sessionID string, response types.PromptResponse) BrokerResolveResult {
	b.mu.Lock()
	pending, ok := b.pending[id]
	if !ok {
		b.mu.Unlock()
		return BrokerResolveNotFound
	}
	if !matchesPendingScope(pending.userID, pending.sessionID, userID, sessionID) {
		b.mu.Unlock()
		return BrokerResolveForbidden
	}
	delete(b.pending, id)
	b.mu.Unlock()
	pending.ch <- response
	return BrokerResolveResolved
}

func matchesPendingScope(expectedUserID, expectedSessionID, userID, sessionID string) bool {
	if expectedUserID != "" && expectedUserID != userID {
		return false
	}
	if expectedSessionID != "" && expectedSessionID != sessionID {
		return false
	}
	return true
}
