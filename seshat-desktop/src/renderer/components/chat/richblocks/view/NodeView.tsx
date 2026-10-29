import type { ComponentType } from 'react'
import type { UiNode } from '../lang/types'
import { isNode } from '../lang/parseUi'
import { dataComponents } from './components/data'
import { guidanceComponents } from './components/guidance'
import { layoutComponents } from './components/layout'
import { textComponents } from './components/text'

export type ComponentProps = { props: Record<string, unknown> }

const REGISTRY: Record<string, ComponentType<ComponentProps>> = {
  ...layoutComponents,
  ...textComponents,
  ...dataComponents,
  ...guidanceComponents
}

export function NodeView({ node }: { node: UiNode }) {
  const Component = REGISTRY[node.name]
  if (Component) return <Component props={node.props} />
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
