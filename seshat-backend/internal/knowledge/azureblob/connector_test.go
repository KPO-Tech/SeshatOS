package azureblob

import (
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
)

// Azure Blob's actual Discover/Sync/config-parsing logic and its own unit +
// Azurite-integration tests now live in pkg/connectors - this
// package only tests its thin wrapper.
func TestConnector_KindAndCapabilities(t *testing.T) {
	c := NewConnector()
	if c.Kind() != connector.Kind("azureblob") {
		t.Fatalf("expected kind %q, got %q", "azureblob", c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityKnowledge {
		t.Fatalf("expected exactly [CapabilityKnowledge], got %+v", caps)
	}
}
