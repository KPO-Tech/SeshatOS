import type { ComponentType } from 'react'
import { architectureComponents } from './components/architecture'
import { chartComponents } from './components/charts'
import { dataComponents } from './components/data'
import { guidanceComponents } from './components/guidance'
import { interactionComponents } from './components/interaction'
import { layoutComponents } from './components/layout'
import { plotComponents } from './components/plot'
import { statsComponents } from './components/stats'
import { textComponents } from './components/text'
import type { ComponentProps } from './NodeView'

export const REGISTRY: Record<string, ComponentType<ComponentProps>> = {
  ...layoutComponents,
  ...textComponents,
  ...dataComponents,
  ...guidanceComponents,
  ...architectureComponents,
  ...chartComponents,
  ...plotComponents,
  ...statsComponents,
  ...interactionComponents
}

export const DRAWN_COMPONENTS: readonly string[] = Object.keys(REGISTRY)
