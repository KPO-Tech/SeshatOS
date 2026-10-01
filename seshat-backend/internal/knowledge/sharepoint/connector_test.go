package sharepoint

import (
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
)

// sharepoint's actual Discover/Sync/Graph-client/permission-mapping logic
// and its own unit tests now live in core/connectors - this package only
// tests its thin wrapper.
func TestConnector_KindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Kind() != connector.Kind("sharepoint") {
		t.Fatalf("expected kind %q, got %q", "sharepoint", c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityKnowledge {
		t.Fatalf("expected exactly [CapabilityKnowledge], got %+v", caps)
	}
}
