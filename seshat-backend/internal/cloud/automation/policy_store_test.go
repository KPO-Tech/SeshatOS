package cloudautomation

import (
	"context"
	"testing"
)

func TestPolicyStoreAllowedFailsOpenWhenNeverSynced(t *testing.T) {
	store := NewPolicyStore(openTestDB(t))
	if !store.Allowed(context.Background(), "allow_custom_providers") {
		t.Fatal("expected a never-synced policy store to allow by default (fail-open)")
	}
}

func TestPolicyStoreSaveLoadRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := NewPolicyStore(openTestDB(t))

	if err := store.Save(ctx, map[string]bool{
		"allow_custom_providers": false,
		"allow_local_models":     true,
	}); err != nil {
		t.Fatalf("save: %v", err)
	}

	if store.Allowed(ctx, "allow_custom_providers") {
		t.Fatal("expected the synced false value to be reflected")
	}
	if !store.Allowed(ctx, "allow_local_models") {
		t.Fatal("expected the synced true value to be reflected")
	}
}

// TestPolicyStoreAllowedFailsOpenForUnknownCode covers both a server that
// doesn't know about a policy this client checks, and a client checking a
// policy that predates any bundle it has - either way, "no signal" must
// never be read as "blocked".
func TestPolicyStoreAllowedFailsOpenForUnknownCode(t *testing.T) {
	ctx := context.Background()
	store := NewPolicyStore(openTestDB(t))

	if err := store.Save(ctx, map[string]bool{"allow_custom_providers": false}); err != nil {
		t.Fatalf("save: %v", err)
	}

	if !store.Allowed(ctx, "some_future_policy_this_bundle_never_mentioned") {
		t.Fatal("expected an unknown policy code to fail open even after a bundle has been synced")
	}
}

func TestPolicyStoreClearRevertsToFailOpen(t *testing.T) {
	ctx := context.Background()
	store := NewPolicyStore(openTestDB(t))

	if err := store.Save(ctx, map[string]bool{"allow_custom_providers": false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if store.Allowed(ctx, "allow_custom_providers") {
		t.Fatal("expected the restriction to apply before clearing")
	}

	if err := store.Clear(ctx); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if !store.Allowed(ctx, "allow_custom_providers") {
		t.Fatal("expected Allowed to fail open again after Clear, like a device that never synced")
	}
}
