import { ConnectorsConfig } from './ConnectorsConfig'

// Where the documents of Knowledge come from: Drive, SharePoint, S3. An account connected here is synchronized into a collection.
// The connectors the agent uses as tools (with an API key) are another thing, in the Plugins page, and this page is laid out like it.
export function SourcesPage() {
  return <ConnectorsConfig />
}
