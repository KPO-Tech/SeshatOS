package cloudautomation

import (
	"context"
	"testing"
)

func TestVersionStoreStatusIsQuietWhenNeverSynced(t *testing.T) {
	store := NewVersionStore(openTestDB(t))
	minAppVersion, outdated := store.Status(context.Background())
	if minAppVersion != nil || outdated {
		t.Fatalf("expected a never-synced version store to report no restriction, got min=%+v outdated=%v", minAppVersion, outdated)
	}
}

func TestVersionStoreSaveLoadRoundTrip(t *testing.T) {
	ctx := context.Background()
	store := NewVersionStore(openTestDB(t))

	minVersion := "1.2.3"
	if err := store.Save(ctx, &minVersion, true); err != nil {
		t.Fatalf("save: %v", err)
	}

	gotMin, gotOutdated := store.Status(ctx)
	if gotMin == nil || *gotMin != minVersion {
		t.Fatalf("expected the synced min_app_version to be reflected, got %+v", gotMin)
	}
	if !gotOutdated {
		t.Fatal("expected the synced outdated flag to be reflected")
	}
}

func TestVersionStoreSaveWithNoRestrictionConfigured(t *testing.T) {
	ctx := context.Background()
	store := NewVersionStore(openTestDB(t))

	if err := store.Save(ctx, nil, false); err != nil {
		t.Fatalf("save: %v", err)
	}

	gotMin, gotOutdated := store.Status(ctx)
	if gotMin != nil || gotOutdated {
		t.Fatalf("expected no restriction to round-trip as no restriction, got min=%+v outdated=%v", gotMin, gotOutdated)
	}
}

func TestVersionStoreClearRevertsToQuiet(t *testing.T) {
	ctx := context.Background()
	store := NewVersionStore(openTestDB(t))

	minVersion := "1.2.3"
	if err := store.Save(ctx, &minVersion, true); err != nil {
		t.Fatalf("save: %v", err)
	}

	if err := store.Clear(ctx); err != nil {
		t.Fatalf("clear: %v", err)
	}
	gotMin, gotOutdated := store.Status(ctx)
	if gotMin != nil || gotOutdated {
		t.Fatalf("expected Clear to revert to a quiet, never-synced state, got min=%+v outdated=%v", gotMin, gotOutdated)
	}
}
