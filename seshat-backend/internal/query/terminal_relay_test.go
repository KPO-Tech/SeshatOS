package query

import "testing"

// TestTerminalRelayResolveRejectsCrossSession is a regression test for the
// fix requiring Resolve to be called with the sessionID of the connection
// delivering the result: without it, any session's WS connection could
// resolve a command pending for a different session (IDs are drawn from a
// single counter shared across all sessions), injecting an arbitrary
// stdout/stderr/exit code into another user's bash execution.
func TestTerminalRelayResolveRejectsCrossSession(t *testing.T) {
	r := NewTerminalRelay()

	ch := make(chan TerminalResult, 1)
	r.mu.Lock()
	r.pending["sess-a-1"] = pendingCommand{sessionID: "sess-a", ch: ch}
	r.mu.Unlock()

	// A different session's connection tries to resolve session A's command.
	r.Resolve("sess-b", TerminalResult{ID: "sess-a-1", Stdout: "injected"})

	select {
	case res := <-ch:
		t.Fatalf("expected cross-session resolve to be dropped, got delivered result: %+v", res)
	default:
		// Correctly dropped.
	}

	// The owning session can still resolve it normally.
	r.Resolve("sess-a", TerminalResult{ID: "sess-a-1", Stdout: "real output"})

	select {
	case res := <-ch:
		if res.Stdout != "real output" {
			t.Fatalf("expected real output delivered, got %+v", res)
		}
	default:
		t.Fatal("expected same-session resolve to deliver the result")
	}
}
