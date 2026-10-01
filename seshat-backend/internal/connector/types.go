// Package connector defines the shared contract every external-source
// integration implements, regardless of domain (Knowledge, Action) - see
// helps/roadmap.md Phase 1.
//
// The contract is deliberately two-layered: Connector itself only declares
// identity and capabilities; the actual behavior for each capability lives
// in its own interface (KnowledgeConnector, ActionConnector below), which a
// caller type-asserts for only when it needs that capability.
package connector

import (
	"context"
	"time"

	coreconnectors "github.com/KPO-Tech/seshat/pkg/connectors"
)

// Kind identifies a connector implementation, e.g. "gdrive", "sharepoint",
// "onedrive", "s3".
type Kind string

// Capability declares one thing a connector can do. Capabilities() lets a
// caller (e.g. a future unified connector catalog in Settings) introspect
// what a connector supports without guessing via type assertions.
type Capability string

const (
	CapabilityKnowledge Capability = "knowledge"
	CapabilityAction    Capability = "action"
)

// Connector is the minimal contract every connector implements. Real
// behavior lives in the capability-specific interfaces below.
type Connector interface {
	Kind() Kind
	Capabilities() []Capability
}

// BlobFetcher is a lazy-fetch pattern - e.g. a Knowledge connector fetching
// a discovered resource's bytes only at ingest time, not at Discover time.
type BlobFetcher interface {
	FetchBlob(ctx context.Context, ref string) (data []byte, err error)
}

// ─── Knowledge connectors (contract only - no implementation yet) ─────────
//
// Deliberately unimplemented in this phase: this is the shape a future
// read-only Knowledge connector (Google Drive, SharePoint - see
// helps/roadmap.md Phase 1's next item) will implement. Written now so
// that work can start directly against a settled contract instead of
// designing it from scratch when the time comes.

// Account is the minimal shape any external connection shares, regardless
// of domain - a SharePoint site, a Postgres connection, an S3 bucket all
// need: who owns it, is it healthy, when did it last sync.
type Account struct {
	ID           string
	UserID       string
	WorkspaceID  string
	Status       string
	LastSyncedAt time.Time
	LastError    string
	// Config is opaque, connector-interpreted, non-secret connection
	// configuration (e.g. an S3 connector's bucket/region/endpoint/prefix,
	// JSON-encoded) - the counterpart to Secret for settings that aren't
	// credentials. Populated by the caller from db.ConnectorAccount.Scope
	// (a free-text column already repurposed this way, see
	// internal/knowledge/s3's doc comment). Empty for connectors that don't
	// need any (Drive, the MCP-backed Action connector) - added when
	// s3 needed it, not before, so it stays genuinely optional.
	Config string
}

// AccessEntry, Secret, ResourceRef, SyncItem are aliases, not new types:
// the Discover/Sync logic that produces/consumes them now lives in
// core/connectors (shared with seshat-server's own connectors package, see
// ROADMAP.md's "core/connectors" entry) - aliasing keeps every consumer in
// this module (the three knowledge connectors, mcp/action) working
// unchanged, with zero conversion code.
//
// AccessEntry names one identity or group allowed to see a resource,
// mirroring Elastic Connectors' prefixed-identity ACL model
// ("user:alice@example.com", "group:eng-team", "domain:example.com" -
// see helps/elastic-connectors's connectors/access_control.py). A nil or
// empty AccessControl on a SyncItem means "inherit the connector account's
// own scope" - today's coarser scope_id (see internal/knowledge's
// permission filter, roadmap.md Phase 1's first item).
//
// Secret is the decrypted connection material a KnowledgeConnector/
// ActionConnector needs to call its external API, kept separate from
// Account so callers can pass account metadata around without risking a
// secret leaking into a log line or API response.
//
// ResourceRef is what Discover returns per resource found - enough to
// decide whether/how to sync it without fetching its content yet.
//
// SyncItem is what Sync yields per resource - content ready for Knowledge
// ingestion, plus the access control list it should carry.
type (
	AccessEntry = coreconnectors.AccessEntry
	Secret      = coreconnectors.Secret
	ResourceRef = coreconnectors.ResourceRef
	SyncItem    = coreconnectors.SyncItem
)

// KnowledgeConnector discovers and syncs external resources into Knowledge.
type KnowledgeConnector interface {
	Connector
	Discover(ctx context.Context, account Account, secret Secret) ([]ResourceRef, error)
	Sync(ctx context.Context, account Account, secret Secret, cursor string) (items []SyncItem, nextCursor string, err error)
}

// ─── Action connectors (contract only - no implementation yet) ────────────

// ActionResult is the outcome of an ActionConnector.Act call.
type ActionResult struct {
	Success bool
	Message string
	Data    map[string]any
}

// ActionConnector performs a side-effecting operation against an external
// system (e.g. creating a CRM entry). No implementation exists yet.
type ActionConnector interface {
	Connector
	Act(ctx context.Context, account Account, secret Secret, action string, payload map[string]any) (ActionResult, error)
}
