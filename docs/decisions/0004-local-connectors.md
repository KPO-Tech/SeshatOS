# 0004 - Local connectors: a backend registry, the person's own key, a loopback gateway

Status: accepted, 2026-10-21. Built in `seshat-backend/internal/connector` (catalog, gateway, local service).

## Context

The desktop listed 29 plugins, built from a catalog shared with the organization admin pages. Only a few worked on a single
machine: 24 of the 28 connector kinds need an OAuth application that an organization registers on a Seshat server, and the
three local ones (Google Drive, SharePoint, S3) only feed a knowledge base, so an agent in chat got no tool from them.
A plugin the person cannot use, or that gives the agent nothing, should not be on the page.

Two facts shaped the design:

- The agent runtime already gives an agent the tools of any MCP server it is configured with. A connector does not need its
  own tool code: it needs to be a configured MCP server, with the person's credential.
- The runtime's HTTP MCP client sends one plain JSON POST per call. Vendor servers speak Streamable HTTP: they want
  `Accept: application/json, text/event-stream`, may answer as a stream of server-sent events, may issue a session id, and
  expect `notifications/initialized` after `initialize`, which the client never sends. Pointed straight at a vendor, the
  runtime cannot talk to it.

## Decision

1. **The backend owns the list.** `connector.LocalCatalog()` is the only list of connectors a person can connect on this machine.
   The desktop reads it from `GET /api/v1/connectors/catalog` and offers nothing else. The shared TypeScript catalog stays for the
   organization admin pages (hidden in v1).
2. **Admission rule.** A connector is in the catalog only if all three hold:
   - authentication works on the person's machine without a secret that Seshat embeds: a key the person creates at the vendor and
     pastes once (a `Definition` has no field that could carry a client secret);
   - the agent gets tools from it: an `https` MCP endpoint of the vendor;
   - it is tested end to end: `TestEveryLocalConnectorWorksEndToEnd` connects every definition through the gateway to a vendor
     stand-in and lists and calls a tool with the runtime's own MCP client.

   `Definition.Validate` enforces the first two in a test; the third is the test above. A vendor also joins only after its hosted
   MCP server is confirmed, in the vendor's documentation, to take such a key as a bearer token.
3. **v1 list: GitHub, Linear, Airtable, Stripe.** Their documentation describes a personal token or restricted key sent as
   `Authorization: Bearer` to `api.githubcopilot.com/mcp/`, `mcp.linear.app/mcp`, `mcp.airtable.com/mcp` and `mcp.stripe.com`.
4. **A loopback gateway** (`connector/gateway`) sits between the runtime and the vendor. It takes the runtime's plain request, adds
   the key, the `Accept` header, the session and protocol version, completes the handshake, reads an event-stream answer down to
   the one JSON-RPC message that answers the request, and returns plain JSON. It listens on `127.0.0.1` on a free port and asks
   for a per-process token, so another program on the machine cannot use a connected account.
5. **The key never reaches the runtime.** It is stored encrypted in the existing connector account (`connector_accounts`). The
   runtime is configured with the gateway's address and the process token, nothing else. The servers are added to the runtime in
   `mcp.Service.Reload` and at startup, not stored in `mcp_servers`, so there is no stale token on disk.
6. **Chat needs no change to use them.** Once connected, the tools appear in the agent's tool list as `mcp__connector-<kind>__<tool>`
   like any MCP tool, under the same permission prompts.
7. **Standalone only.** When the backend is connected to an organization server the local catalog is empty: the organization brings its
   own connectors, and its MCP catalog is merged by the existing approval flow.
8. **Knowledge connectors are hidden.** Google Drive, SharePoint, S3 and Azure Blob feed a knowledge base, which is built as a separate
   platform later. Their code stays; the desktop hides them with the `knowledge` flag of `lib/edition.ts`.

## Consequences

- Adding a connector is one `Definition` in `catalog.go` plus the end-to-end test passing for it; the desktop needs no change.
- The end-to-end test uses a vendor stand-in that behaves like the real ones. It does not prove a given vendor accepts a given key:
  that is checked by hand per vendor, with a real key, before the connector is announced. A wrong key shows as an error state with the
  vendor's refusal explained, never the key.
- One account per kind: the local catalog assumes one person per machine. The gateway uses the latest account of a kind.
- The gateway is a second small server in the backend process. Streamable HTTP support in the runtime's client would make it
  unnecessary for the transport part, but not for keeping the key out of the runtime's configuration.

## Not decided here

- OAuth connectors for a single machine (Gmail, Slack, Notion, ...). They need an OAuth client: either the person registers one,
  or a vendor supports dynamic client registration with PKCE. A vendor joins by the same rule once one of these works without a
  secret Seshat embeds.
- The cloud version of connectors (organization OAuth apps, per-employee accounts), which is SeshatCloud's work.
