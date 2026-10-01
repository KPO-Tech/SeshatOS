// Package azureblob implements connector.KnowledgeConnector for
// Azure Blob Storage by wrapping pkg/connectors.AzureBlobConnector -
// the actual Discover/Sync logic lives there now (shared with
// seshat-server's own connectors package). This file only adapts core's
// plain (config, secret, cursor) signature to connector.KnowledgeConnector,
// passing account.Config through as the explicit config parameter core
// needs - same shape as s3, the closest sibling connector (both
// are static-credential object-store connectors, no OAuth).
package azureblob

import (
	"context"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

const Kind connector.Kind = "azureblob"

// AccountConfig, ParseAccountConfig, EncodeAccountConfig are aliases, not
// new declarations - the config shape/parsing now lives in
// pkg/connectors, shared with seshat-server.
type AccountConfig = coreconnectors.AzureBlobAccountConfig

var (
	ParseAccountConfig  = coreconnectors.ParseAzureBlobAccountConfig
	EncodeAccountConfig = coreconnectors.EncodeAzureBlobAccountConfig
)

type Connector struct {
	inner *coreconnectors.AzureBlobConnector
}

func NewConnector() *Connector {
	return &Connector{inner: coreconnectors.NewAzureBlobConnector()}
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
