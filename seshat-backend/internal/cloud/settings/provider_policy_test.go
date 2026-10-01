package cloudsettings

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/seshat/pkg/providers"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func newTestPolicyStore(t *testing.T) *cloudautomation.PolicyStore {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	return cloudautomation.NewPolicyStore(database)
}

func TestCheckCreatePolicyAllowsWhenNoPolicyStoreWired(t *testing.T) {
	p := &Provider{}
	if err := p.checkCreatePolicy(context.Background(), "some-totally-custom-provider", ""); err != nil {
		t.Fatalf("expected no policy check without a wired PolicyStore, got: %v", err)
	}
}

func TestCheckCreatePolicyAllowsWhenNeverSynced(t *testing.T) {
	p := &Provider{policies: newTestPolicyStore(t)}
	if err := p.checkCreatePolicy(context.Background(), "some-totally-custom-provider", ""); err != nil {
		t.Fatalf("expected fail-open (allowed) before any policy bundle has synced, got: %v", err)
	}
	if err := p.checkCreatePolicy(context.Background(), "ollama", ""); err != nil {
		t.Fatalf("expected ollama to fail-open too before any sync, got: %v", err)
	}
}

func TestCheckCreatePolicyAllowsKnownProviderWithDefaultBaseURL(t *testing.T) {
	policies := newTestPolicyStore(t)
	if err := policies.Save(context.Background(), map[string]bool{cloudautomation.DesktopPolicyAllowCustomProviders: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	p := &Provider{policies: policies}

	// Empty base_url (use the default) and the literal default base_url
	// must both be treated as "not custom" - a known provider used normally.
	if err := p.checkCreatePolicy(context.Background(), "anthropic", ""); err != nil {
		t.Fatalf("expected a known provider with no base_url override to remain allowed even when custom providers are restricted, got: %v", err)
	}
}

// TestCheckCreatePolicyBlocksKnownProviderWithOverriddenBaseURL is the
// realistic, UI-reachable case: seshat-ui's Add Provider form only lets a
// user pick a provider name from the built-in catalog (the dropdown is
// drawn from it), but its Base URL field is freely editable - so "custom
// provider" in practice means a known provider pointed at a different
// endpoint, exactly what this product's own catalog entry describes.
func TestCheckCreatePolicyBlocksKnownProviderWithOverriddenBaseURL(t *testing.T) {
	policies := newTestPolicyStore(t)
	if err := policies.Save(context.Background(), map[string]bool{cloudautomation.DesktopPolicyAllowCustomProviders: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	p := &Provider{policies: policies}

	if err := p.checkCreatePolicy(context.Background(), "anthropic", "https://my-self-hosted-proxy.example.com"); err == nil {
		t.Fatal("expected a known provider with an overridden base_url to be rejected when allow_custom_providers is false")
	}
}

// TestCheckCreatePolicyBlocksUnknownProviderName is defense in depth for a
// caller that bypasses seshat-ui entirely (e.g. a direct API call) with a
// provider name outside the catalog altogether.
func TestCheckCreatePolicyBlocksUnknownProviderName(t *testing.T) {
	policies := newTestPolicyStore(t)
	if err := policies.Save(context.Background(), map[string]bool{cloudautomation.DesktopPolicyAllowCustomProviders: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	p := &Provider{policies: policies}

	if err := p.checkCreatePolicy(context.Background(), "some-totally-unknown-provider", ""); err == nil {
		t.Fatal("expected an unknown provider name to be rejected when allow_custom_providers is false")
	}
}

func TestCheckCreatePolicyBlocksOllamaWhenLocalModelsRestricted(t *testing.T) {
	policies := newTestPolicyStore(t)
	if err := policies.Save(context.Background(), map[string]bool{cloudautomation.DesktopPolicyAllowLocalModels: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	p := &Provider{policies: policies}

	if err := p.checkCreatePolicy(context.Background(), "ollama", ""); err == nil {
		t.Fatal("expected ollama to be rejected when allow_local_models is false")
	}
	// A restriction on local models must not spill over into blocking an
	// unrelated custom-base_url provider - the two policies are independent.
	if err := policies.Save(context.Background(), map[string]bool{
		cloudautomation.DesktopPolicyAllowLocalModels: false, cloudautomation.DesktopPolicyAllowCustomProviders: true,
	}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := p.checkCreatePolicy(context.Background(), "anthropic", "https://my-self-hosted-proxy.example.com"); err != nil {
		t.Fatalf("expected allow_local_models=false to not affect an unrelated custom-base_url provider check, got: %v", err)
	}
}

func TestCheckCreatePolicyIsCaseInsensitiveOnProviderName(t *testing.T) {
	policies := newTestPolicyStore(t)
	if err := policies.Save(context.Background(), map[string]bool{cloudautomation.DesktopPolicyAllowLocalModels: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	p := &Provider{policies: policies}

	if err := p.checkCreatePolicy(context.Background(), "OLLAMA", ""); err == nil {
		t.Fatal("expected provider name matching to be case-insensitive")
	}
}

// TestCheckCreatePolicyTrailingSlashDoesNotCountAsCustom guards against a
// false positive: a base_url that matches the default except for a
// trailing slash must not be treated as an override.
func TestCheckCreatePolicyTrailingSlashDoesNotCountAsCustom(t *testing.T) {
	policies := newTestPolicyStore(t)
	if err := policies.Save(context.Background(), map[string]bool{cloudautomation.DesktopPolicyAllowCustomProviders: false}); err != nil {
		t.Fatalf("save: %v", err)
	}
	p := &Provider{policies: policies}

	defaultURL := providers.DefaultBaseURL("anthropic")
	if err := p.checkCreatePolicy(context.Background(), "anthropic", defaultURL+"/"); err != nil {
		t.Fatalf("expected a trailing-slash variant of the default base_url to not count as custom, got: %v", err)
	}
}
