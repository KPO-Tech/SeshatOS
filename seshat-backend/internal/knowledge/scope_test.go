package knowledge

import (
	"context"
	"testing"
)

func TestScope(t *testing.T) {
	ctx := context.Background()
	if got := ScopeFromContext(ctx); got != "" {
		t.Fatalf("a context has no scope until one is set, got %q", got)
	}
	if got := ScopeFromContext(WithScope(ctx, "  corpus-1 ")); got != "corpus-1" {
		t.Fatalf("the scope is the trimmed corpus id, got %q", got)
	}
	if got := ScopeFromContext(WithScope(ctx, "   ")); got != "" {
		t.Fatalf("a blank id sets no scope, got %q", got)
	}
}
