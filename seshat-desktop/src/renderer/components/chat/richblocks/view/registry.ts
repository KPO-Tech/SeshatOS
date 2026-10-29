import type { ComponentType } from 'react'
import { dataComponents } from './components/data'
import { guidanceComponents } from './components/guidance'
import { layoutComponents } from './components/layout'
import { textComponents } from './components/text'
import type { ComponentProps } from './NodeView'

export const REGISTRY: Record<string, ComponentType<ComponentProps>> = {
  ...layoutComponents,
  ...textComponents,
  ...dataComponents,
  ...guidanceComponents
}

export const DRAWN_COMPONENTS: readonly string[] = Object.keys(REGISTRY)
