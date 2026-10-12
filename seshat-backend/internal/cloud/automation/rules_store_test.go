package cloudautomation

import (
	"context"
	"testing"
)

func TestRuleStoreHasNoPolicyUntilRulesArrive(t *testing.T) {
	store := NewRuleStore(openTestDB(t))
	if store.Policy(context.Background()) != nil {
		t.Fatal("a device that never synced must have no rules")
	}
}

func TestRuleStoreKeepsTheLastRulesAndHandsThemToTheEngine(t *testing.T) {
	ctx := context.Background()
	store := NewRuleStore(openTestDB(t))
	if err := store.Save(ctx, &DeviceRules{Instructions: "No customer data outside.", ForbiddenTools: []string{"bash"}, Version: "v1"}); err != nil {
		t.Fatalf("save: %v", err)
	}
	policy := store.Policy(ctx)
	if policy == nil || policy.Instructions != "No customer data outside." || len(policy.ForbiddenTools) != 1 {
		t.Fatalf("unexpected policy %+v", policy)
	}
	// A heartbeat from a server that predates the rules must not relax what was received.
	if err := store.Save(ctx, nil); err != nil {
		t.Fatalf("save nil: %v", err)
	}
	if store.Policy(ctx) == nil {
		t.Fatal("an answer without rules must leave the stored ones alone")
	}
	// An organization that removed every rule sends empty rules: nothing is imposed any more.
	if err := store.Save(ctx, &DeviceRules{ForbiddenTools: []string{}, Version: "v2"}); err != nil {
		t.Fatalf("save empty: %v", err)
	}
	if store.Policy(ctx) != nil {
		t.Fatal("empty rules must impose nothing")
	}
}

func TestRuleStoreClearDropsTheRules(t *testing.T) {
	ctx := context.Background()
	store := NewRuleStore(openTestDB(t))
	_ = store.Save(ctx, &DeviceRules{Instructions: "x"})
	if err := store.Clear(ctx); err != nil {
		t.Fatalf("clear: %v", err)
	}
	if store.Policy(ctx) != nil {
		t.Fatal("cleared rules must be gone")
	}
}
