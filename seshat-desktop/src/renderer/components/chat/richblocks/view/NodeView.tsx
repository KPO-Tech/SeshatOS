import type { UiNode } from '../lang/types'
import { isNode } from '../lang/parseUi'
import { REGISTRY } from './registry'

export type ComponentProps = { props: Record<string, unknown>; id?: string }

export function NodeView({ node }: { node: UiNode }) {
  const Component = REGISTRY[node.name]
  if (Component) return <Component props={node.props} id={node.id} />
  return <NotDrawn node={node} />
}

export function NodeList({ nodes }: { nodes: unknown }) {
  if (!Array.isArray(nodes)) return null
  return (
    <>
      {nodes.map((child, index) => (isNode(child) ? <NodeView key={index} node={child} /> : null))}
    </>
  )
}

/** A catalog component the app has no drawing for yet: its text is shown so nothing is lost. */
function NotDrawn({ node }: { node: UiNode }) {
  const lines = Object.values(node.props).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
  return (
    <div className="rounded-md border border-dashed border-app-border-subtle px-2.5 py-1.5 text-xs text-app-text-muted">
      <span className="font-medium">{node.name}</span>
      {lines.length > 0 && <span>{`: ${lines.join(' - ')}`}</span>}
    </div>
  )
}
