// No backend/SDK today timestamps a thinking block's start/end, so there's
// no real duration to show collapsed - a flattened, truncated preview of the
// thought itself is the closest available stand-in for "not totally empty".
// Shared by the standalone ThinkingBlock (MessageItem.tsx) and the grouped
// ThinkingGroupItem (QuietToolGroup.tsx) so both collapse the same way.
export function thinkingPreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  return flat.length > 90 ? `${flat.slice(0, 90).trimEnd()}…` : flat
}
