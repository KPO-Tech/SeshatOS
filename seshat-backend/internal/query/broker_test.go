package query

import (
	"sync"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat/pkg/types"
)

// ─── PermissionBroker ─────────────────────────────────────────────────────────

func TestPermissionBrokerResolveApproved(t *testing.T) {
	b := NewPermissionBroker()
	ch := b.Await("req-1", "user-a", "sess-1")

	result := b.Resolve("req-1", "user-a", "sess-1", true, false, "")
	if result != BrokerResolveResolved {
		t.Fatalf("expected Resolved, got %v", result)
	}

	select {
	case decision := <-ch:
		if !decision.Approved {
			t.Error("expected approved=true")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for channel")
	}
}

func TestPermissionBrokerResolveDenied(t *testing.T) {
	b := NewPermissionBroker()
	ch := b.Await("req-2", "user-a", "sess-1")

	b.Resolve("req-2", "user-a", "sess-1", false, false, "please revise the approach")

	select {
	case decision := <-ch:
		if decision.Approved {
			t.Error("expected approved=false")
		}
		if decision.Reason != "please revise the approach" {
			t.Errorf("expected deny reason to flow through, got %q", decision.Reason)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out")
	}
}

func TestPermissionBrokerResolveNotFound(t *testing.T) {
	b := NewPermissionBroker()
	result := b.Resolve("does-not-exist", "user-a", "sess-1", true, false, "")
	if result != BrokerResolveNotFound {
		t.Errorf("expected NotFound, got %v", result)
	}
}

func TestPermissionBrokerResolveForbiddenDifferentUser(t *testing.T) {
	b := NewPermissionBroker()
	b.Await("req-3", "user-a", "sess-1")

	result := b.Resolve("req-3", "user-b", "sess-1", true, false, "")
	if result != BrokerResolveForbidden {
		t.Errorf("expected Forbidden, got %v", result)
	}
}

func TestPermissionBrokerResolveForbiddenDifferentSession(t *testing.T) {
	b := NewPermissionBroker()
	b.Await("req-4", "user-a", "sess-1")

	result := b.Resolve("req-4", "user-a", "sess-other", true, false, "")
	if result != BrokerResolveForbidden {
		t.Errorf("expected Forbidden, got %v", result)
	}
}

func TestPermissionBrokerEmptyScopeMatchesAny(t *testing.T) {
	b := NewPermissionBroker()
	// Empty userID + sessionID in the pending entry means any caller can resolve it.
	b.Await("req-5", "", "")

	result := b.Resolve("req-5", "user-anyone", "sess-anything", true, false, "")
	if result != BrokerResolveResolved {
		t.Errorf("expected Resolved for empty scope, got %v", result)
	}
}

func TestPermissionBrokerCancel(t *testing.T) {
	b := NewPermissionBroker()
	b.Await("req-6", "user-a", "sess-1")
	b.Cancel("req-6")

	// After cancel, Resolve should return NotFound.
	result := b.Resolve("req-6", "user-a", "sess-1", true, false, "")
	if result != BrokerResolveNotFound {
		t.Errorf("expected NotFound after cancel, got %v", result)
	}
}

func TestPermissionBrokerCancelNonExistentIsNoOp(t *testing.T) {
	b := NewPermissionBroker()
	b.Cancel("phantom") // must not panic
}

// Concurrent resolves from multiple goroutines: only one must win.
func TestPermissionBrokerConcurrentResolve(t *testing.T) {
	b := NewPermissionBroker()
	b.Await("req-c", "user-a", "")

	var wg sync.WaitGroup
	resolved := make(chan BrokerResolveResult, 10)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resolved <- b.Resolve("req-c", "user-a", "", true, false, "")
		}()
	}
	wg.Wait()
	close(resolved)

	got := 0
	for r := range resolved {
		if r == BrokerResolveResolved {
			got++
		}
	}
	if got != 1 {
		t.Errorf("expected exactly 1 goroutine to get Resolved, got %d", got)
	}
}

// ─── PromptBroker ─────────────────────────────────────────────────────────────

func TestPromptBrokerResolveResponse(t *testing.T) {
	b := NewPromptBroker()
	ch := b.Await("p-1", "user-a", "sess-1")

	resp := types.PromptResponse{Value: "my answer"}
	result := b.Resolve("p-1", "user-a", "sess-1", resp)
	if result != BrokerResolveResolved {
		t.Fatalf("expected Resolved, got %v", result)
	}

	select {
	case got := <-ch:
		if got.Value != "my answer" {
			t.Errorf("unexpected response: %+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out")
	}
}

func TestPromptBrokerResolveNotFound(t *testing.T) {
	b := NewPromptBroker()
	result := b.Resolve("ghost", "user-a", "sess-1", types.PromptResponse{})
	if result != BrokerResolveNotFound {
		t.Errorf("expected NotFound, got %v", result)
	}
}

func TestPromptBrokerResolveForbidden(t *testing.T) {
	b := NewPromptBroker()
	b.Await("p-2", "user-a", "sess-1")

	result := b.Resolve("p-2", "user-x", "sess-1", types.PromptResponse{})
	if result != BrokerResolveForbidden {
		t.Errorf("expected Forbidden, got %v", result)
	}
}

func TestPromptBrokerCancel(t *testing.T) {
	b := NewPromptBroker()
	b.Await("p-3", "user-a", "sess-1")
	b.Cancel("p-3")

	result := b.Resolve("p-3", "user-a", "sess-1", types.PromptResponse{})
	if result != BrokerResolveNotFound {
		t.Errorf("expected NotFound after cancel, got %v", result)
	}
}

func TestPromptBrokerConcurrentResolve(t *testing.T) {
	b := NewPromptBroker()
	b.Await("p-c", "user-a", "")

	var wg sync.WaitGroup
	resolved := make(chan BrokerResolveResult, 10)
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			resolved <- b.Resolve("p-c", "user-a", "", types.PromptResponse{Value: "x"})
		}()
	}
	wg.Wait()
	close(resolved)

	got := 0
	for r := range resolved {
		if r == BrokerResolveResolved {
			got++
		}
	}
	if got != 1 {
		t.Errorf("expected exactly 1 resolved, got %d", got)
	}
}
