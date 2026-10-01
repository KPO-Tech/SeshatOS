// Package s3 implements connector.KnowledgeConnector for any
// S3-compatible object store by wrapping core/connectors.S3Connector - the
// actual Discover/Sync logic lives there now (shared with seshat-server's
// own connectors package, see ROADMAP.md's "core/connectors" entry). This
// file only adapts core's plain (config, secret, cursor) signature to
// connector.KnowledgeConnector, passing account.Config through as the
// explicit config parameter core needs - s3 is the one connector whose
// Discover/Sync actually reads anything off connector.Account.
package s3

import (
	"context"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/connector"
	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

const Kind connector.Kind = "s3"

// AccountConfig, ParseAccountConfig, EncodeAccountConfig are aliases, not
// new declarations - the config shape/parsing now lives in
// core/connectors, shared with seshat-server.
type AccountConfig = coreconnectors.S3AccountConfig

var (
	ParseAccountConfig  = coreconnectors.ParseS3AccountConfig
	EncodeAccountConfig = coreconnectors.EncodeS3AccountConfig
)

type Connector struct {
	inner *coreconnectors.S3Connector
}

func NewConnector() *Connector {
	return &Connector{inner: coreconnectors.NewS3Connector()}
}

func (c *Connector) WithTextExtractor(fn func(ctx context.Context, data []byte, contentType, filename string) string) *Connector {
	c.inner.WithTextExtractor(coreconnectors.TextExtractorFunc(fn))
	return c
}

func (c *Connector) Kind() connector.Kind { return Kind }

func (c *Connector) Capabilities() []connector.Capability {
	return []connector.Capability{connector.CapabilityKnowledge}
}

func (c *Connector) Discover(ctx context.Context, account connector.Account, secret connector.Secret) ([]connector.ResourceRef, error) {
	return c.inner.Discover(ctx, account.Config, secret)
}

func (c *Connector) Sync(ctx context.Context, account connector.Account, secret connector.Secret, cursor string) ([]connector.SyncItem, string, error) {
	return c.inner.Sync(ctx, account.Config, secret, cursor)
}

var _ connector.KnowledgeConnector = (*Connector)(nil)
