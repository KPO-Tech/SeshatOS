package cloudidentity

import (
	"context"
	"testing"
)

// TestPrincipalFromMeResolvesOwnerRoleWithoutOrganizationIDConfigured is a
// regression test for the bug this session found: principalFromMe used to
// match memberships against a pre-configured (and easy to forget/misalign)
// organizationID, silently falling back to "member" for anyone whose actual
// role didn't match - including an actual org owner. It must now resolve
// straight from the caller's own single membership instead.
func TestPrincipalFromMeResolvesOwnerRoleWithoutOrganizationIDConfigured(t *testing.T) {
	p := &Provider{}
	me := &meResponse{
		User: User{ID: "usr_1", Email: "owner@example.com", DisplayName: "Owner"},
		Memberships: []Membership{
			{ID: "mem_1", UserID: "usr_1", OrganizationID: "org_1", Role: "owner"},
		},
	}

	principal := p.principalFromMe(context.Background(), me, "token123")

	if len(principal.Roles) == 0 || principal.Roles[0] != "owner" {
		t.Fatalf("expected role 'owner' resolved from the caller's own membership, got %v", principal.Roles)
	}
}

// TestPrincipalFromMeResolvesMemberRole confirms a plain member still
// resolves correctly (not a false positive from the owner test above).
func TestPrincipalFromMeResolvesMemberRole(t *testing.T) {
	p := &Provider{}
	me := &meResponse{
		User: User{ID: "usr_2", Email: "member@example.com", DisplayName: "Member"},
		Memberships: []Membership{
			{ID: "mem_2", UserID: "usr_2", OrganizationID: "org_1", Role: "member"},
		},
	}

	principal := p.principalFromMe(context.Background(), me, "token456")

	if len(principal.Roles) == 0 || principal.Roles[0] != "member" {
		t.Fatalf("expected role 'member', got %v", principal.Roles)
	}
}

// TestPrincipalFromMeHandlesZeroMemberships covers the platform super-admin
// case (or any account with no organization at all, by design) - must not
// panic and must degrade to the same "member"/no-org defaults as before.
func TestPrincipalFromMeHandlesZeroMemberships(t *testing.T) {
	p := &Provider{}
	me := &meResponse{
		User:        User{ID: "usr_3", Email: "admin@example.com", DisplayName: "Platform Admin", IsAdmin: true},
		Memberships: nil,
	}

	principal := p.principalFromMe(context.Background(), me, "token789")

	if len(principal.Roles) == 0 || principal.Roles[0] != "member" {
		t.Fatalf("expected default role 'member' for a user with no memberships, got %v", principal.Roles)
	}
	found := false
	for _, r := range principal.Roles {
		if r == "admin" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected the platform admin flag to still add the 'admin' role")
	}
}

// TestPrincipalFromMeResolvesOrganizationIDWithoutLocalWorkspaces is a
// regression test for the bug found live: a freshly connected desktop
// account has zero LOCAL workspaces (identity store empty), so
// WorkspaceMemberships stayed empty and OrganizationID() silently returned
// "" - breaking every org-scoped resolution (providers, web search, MCP,
// agents) on a brand-new account, even though the org membership came back
// fine in the /auth/me response. ResolvedOrganizationID must be set directly
// from the membership, independent of local workspace count.
func TestPrincipalFromMeResolvesOrganizationIDWithoutLocalWorkspaces(t *testing.T) {
	p := &Provider{} // identity is nil: no local workspaces, same as a fresh install
	me := &meResponse{
		User: User{ID: "usr_4", Email: "fresh@example.com", DisplayName: "Fresh Account"},
		Memberships: []Membership{
			{ID: "mem_4", UserID: "usr_4", OrganizationID: "org_1", Role: "admin"},
		},
	}

	principal := p.principalFromMe(context.Background(), me, "token999")

	if len(principal.WorkspaceMemberships) != 0 {
		t.Fatalf("expected zero workspace memberships (no identity store), got %v", principal.WorkspaceMemberships)
	}
	if got := principal.OrganizationID(); got != "org_1" {
		t.Fatalf("expected OrganizationID() to resolve to 'org_1' even without local workspaces, got %q", got)
	}
}
