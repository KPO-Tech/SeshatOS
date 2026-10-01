package gdrive

import (
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
)

// gdrive's actual Discover/Sync/permission-mapping/allowlist logic and its
// own unit tests now live in core/connectors - this package only tests its
// thin wrapper.
func TestConnector_KindAndCapabilities(t *testing.T) {
	c := NewConnector(nil)
	if c.Kind() != connector.Kind("gdrive") {
		t.Fatalf("expected kind %q, got %q", "gdrive", c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityKnowledge {
		t.Fatalf("expected exactly [CapabilityKnowledge], got %+v", caps)
	}
}
