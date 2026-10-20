package connector

import (
	"strings"
	"testing"
)

func TestLocalCatalogMeetsTheAdmissionRule(t *testing.T) {
	seen := map[Kind]bool{}
	for _, d := range LocalCatalog() {
		if err := d.Validate(); err != nil {
			t.Errorf("%v", err)
		}
		if seen[d.Kind] {
			t.Errorf("connector %q is listed twice", d.Kind)
		}
		seen[d.Kind] = true
		if !strings.HasPrefix(d.ServerName(), "connector-") {
			t.Errorf("connector %q: server name %q lacks the connector- prefix", d.Kind, d.ServerName())
		}
	}
	if len(seen) == 0 {
		t.Fatal("the local catalog is empty")
	}
}

func TestValidateRejectsWhatTheRuleForbids(t *testing.T) {
	valid := Definition{
		Kind: "x", Label: "X", Description: "d", Auth: AuthAPIKey, CredentialLabel: "Key", MCPURL: "https://mcp.example.com/mcp",
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("a valid definition was rejected: %v", err)
	}
	cases := map[string]func(Definition) Definition{
		"OAuth needs a secret Seshat would embed": func(d Definition) Definition { d.Auth = "oauth"; return d },
		"no tools without an MCP endpoint":        func(d Definition) Definition { d.MCPURL = ""; return d },
		"a plain http endpoint":                   func(d Definition) Definition { d.MCPURL = "http://mcp.example.com"; return d },
		"credentials in the endpoint":             func(d Definition) Definition { d.MCPURL = "https://user:pw@mcp.example.com"; return d },
		"an unnamed credential":                   func(d Definition) Definition { d.CredentialLabel = ""; return d },
		"no label":                                func(d Definition) Definition { d.Label = ""; return d },
	}
	for name, mutate := range cases {
		if err := mutate(valid).Validate(); err == nil {
			t.Errorf("%s: expected the definition to be rejected", name)
		}
	}
}

func TestLookupLocal(t *testing.T) {
	if d, ok := LookupLocal("github"); !ok || d.Label != "GitHub" {
		t.Fatalf("github not found: %+v %v", d, ok)
	}
	if _, ok := LookupLocal("salesforce"); ok {
		t.Fatal("salesforce needs an organization OAuth app and must not be in the local catalog")
	}
}
