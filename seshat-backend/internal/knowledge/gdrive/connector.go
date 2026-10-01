// Package gdrive implements connector.KnowledgeConnector for
// Google Drive (read-only) by wrapping core/connectors.GDriveConnector -
// the actual Discover/Sync/permission-mapping logic lives there now
// (shared with seshat-server's own connectors package, see ROADMAP.md's
// "core/connectors" entry). This file only adapts core's plain (secret,
// cursor) signature to connector.KnowledgeConnector (account is accepted
// but unused - gdrive's Discover/Sync never read it, confirmed before
// extracting).
package gdrive

import (
	"context"

	"golang.org/x/oauth2"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

const Kind connector.Kind = "gdrive"

type Connector struct {
	inner *coreconnectors.GDriveConnector
}

func NewConnector(oauthConfig *oauth2.Config) *Connector {
	return &Connector{inner: coreconnectors.NewGDriveConnector(oauthConfig)}
}

// WithTextExtractor wires binary-file extraction (PDF/DOCX/PPTX/XLSX via
// a document reader) into the connector - see core/connectors.TextExtractorFunc's doc
// comment. Returns the receiver so callers can chain it onto NewConnector,
// mirroring knowledge.Service.WithDocumentReader's fluent pattern.
func (c *Connector) WithTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *Connector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *Connector) Kind() connector.Kind { return Kind }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityKnowledge}
}

func (c *Connector) Discover(ctx context.Context, account connector.Account, secret connector.Secret) ([]connector.ResourceRef, error) {
	return c.inner.Discover(ctx, secret)
}

func (c *Connector) Sync(ctx context.Context, account connector.Account, secret connector.Secret, cursor string) ([]connector.SyncItem, string, error) {
	return c.inner.Sync(ctx, secret, cursor)
}

var _ connector.KnowledgeConnector = (*Connector)(nil)
