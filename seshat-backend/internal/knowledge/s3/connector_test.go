package s3

import (
	"testing"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
)

// s3's actual Discover/Sync/config-parsing logic and its own unit +
// MinIO-integration tests now live in core/connectors - this package only
// tests its thin wrapper.
func TestConnector_KindAndCapabilities(t *testing.T) {
	c := NewConnector()
	if c.Kind() != connector.Kind("s3") {
		t.Fatalf("expected kind %q, got %q", "s3", c.Kind())
	}
	caps := c.Capabilities()
	if len(caps) != 1 || caps[0] != connector.CapabilityKnowledge {
		t.Fatalf("expected exactly [CapabilityKnowledge], got %+v", caps)
	}
}
