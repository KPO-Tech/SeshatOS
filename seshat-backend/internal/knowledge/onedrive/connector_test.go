package onedrive

import (
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

// onedrive's actual Discover/Sync/Graph-client logic and its own unit tests
// now live in core/connectors - this package only tests its thin wrapper.
func TestConnector_KindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Kind() != connector.Kind("onedrive") {
		t.Fatalf("expected kind %q, got %q", "onedrive", c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityKnowledge {
		t.Fatalf("expected exactly [CapabilityKnowledge], got %+v", caps)
	}
}
