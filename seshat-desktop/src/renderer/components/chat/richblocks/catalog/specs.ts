import type { ArgSpec, ArgType, ComponentSpec } from './types'

const str: ArgType = { t: 'string' }
const num: ArgType = { t: 'number' }
const bool: ArgType = { t: 'boolean' }
const scalar: ArgType = { t: 'scalar' }
const cell: ArgType = { t: 'cell' }
const action: ArgType = { t: 'action' }
const enumOf = (...values: string[]): ArgType => ({ t: 'enum', values })
const node = (...of: string[]): ArgType => ({ t: 'node', of: of.length > 0 ? of : undefined })
const list = (item: ArgType): ArgType => ({ t: 'list', item })

const req = (name: string, type: ArgType): ArgSpec => ({ name, type })
const opt = (name: string, type: ArgType): ArgSpec => ({ name, type, optional: true })

const tone = enumOf('neutral', 'info', 'success', 'warning', 'danger')
const anyNode = node()

// Arguments are positional and append-only: add at the end, never reorder or remove.
export const COMPONENT_SPECS: ComponentSpec[] = [
  { name: 'Stack', group: 'Layout', description: 'Lays its children out in a column or a row.',
    args: [req('children', list(anyNode)), opt('direction', enumOf('column', 'row')), opt('gap', enumOf('sm', 'md', 'lg'))] },
  { name: 'Card', group: 'Layout', description: 'A bordered block with an optional title.',
    args: [req('children', list(anyNode)), opt('title', str), opt('tone', tone)] },
  { name: 'Section', group: 'Layout', description: 'A titled part of the answer, collapsible when it is long.',
    args: [req('title', str), req('children', list(anyNode)), opt('open', bool), opt('collapsible', bool)] },
  { name: 'Tabs', group: 'Layout', description: 'Alternative views of the same subject.',
    args: [req('tabs', list(node('Tab')))] },
  { name: 'Tab', group: 'Layout', description: 'One tab of Tabs.',
    args: [req('label', str), req('children', list(anyNode))] },
  { name: 'Accordion', group: 'Layout', description: 'Several Sections of which one opens at a time.',
    args: [req('items', list(node('Section')))] },
  { name: 'Separator', group: 'Layout', description: 'A thin rule.', args: [] },

  { name: 'Heading', group: 'Text', description: 'A heading inside a block.',
    args: [req('text', str), opt('level', num)] },
  { name: 'Markdown', group: 'Text', description: 'A paragraph of plain text.',
    args: [req('text', str)] },
  { name: 'Callout', group: 'Text', description: 'A highlighted note: info, success, warning or danger.',
    args: [req('tone', tone), req('title', str), opt('body', str)] },
  { name: 'Badge', group: 'Text', description: 'A short status label.',
    args: [req('text', str), opt('tone', tone)] },
  { name: 'Quote', group: 'Text', description: 'A quotation with its source.',
    args: [req('text', str), opt('source', str)] },

  { name: 'Table', group: 'Data', description: 'Rows and columns. A cell is a text, a number, a Badge, a FileRef or a Link.',
    args: [req('columns', list(node('Col'))), req('rows', list(list(cell))), opt('caption', str), opt('sortable', bool)] },
  { name: 'Col', group: 'Data', description: 'A column of Table: its label and how its values are formatted.',
    args: [req('label', str), opt('kind', enumOf('text', 'number', 'percent', 'money', 'date')), opt('align', enumOf('left', 'right', 'center'))] },
  { name: 'Metric', group: 'Data', description: 'One figure with its label and its change.',
    args: [req('label', str), req('value', scalar), opt('delta', scalar), opt('trend', enumOf('up', 'down', 'flat')), opt('note', str)] },
  { name: 'MetricRow', group: 'Data', description: 'Several Metric side by side.',
    args: [req('metrics', list(node('Metric')))] },
  { name: 'Timeline', group: 'Data', description: 'Events in time order.',
    args: [req('items', list(node('TimelineItem')))] },
  { name: 'TimelineItem', group: 'Data', description: 'One event of Timeline.',
    args: [req('title', str), opt('when', str), opt('body', str), opt('tone', tone)] },
  { name: 'KeyValues', group: 'Data', description: 'A list of facts, each a name and a value.',
    args: [req('pairs', list(node('Pair')))] },
  { name: 'Pair', group: 'Data', description: 'One fact of KeyValues.',
    args: [req('key', str), req('value', cell)] },

  { name: 'BarChart', group: 'Charts', description: 'Bars, one group per label and one bar per series.',
    args: [req('labels', list(str)), req('series', list(node('Series'))), opt('mode', enumOf('grouped', 'stacked')), opt('unit', str), opt('horizontal', bool)] },
  { name: 'LineChart', group: 'Charts', description: 'Lines over ordered labels.',
    args: [req('labels', list(str)), req('series', list(node('Series'))), opt('unit', str)] },
  { name: 'AreaChart', group: 'Charts', description: 'Filled lines over ordered labels.',
    args: [req('labels', list(str)), req('series', list(node('Series'))), opt('unit', str), opt('stacked', bool)] },
  { name: 'PieChart', group: 'Charts', description: 'Shares of a whole.',
    args: [req('labels', list(str)), req('values', list(num)), opt('donut', bool)] },
  { name: 'ScatterChart', group: 'Charts', description: 'Points on two axes.',
    args: [req('series', list(node('Points'))), opt('xLabel', str), opt('yLabel', str)] },
  { name: 'Series', group: 'Charts', description: 'A named list of values, one per label.',
    args: [req('name', str), req('values', list(num))] },
  { name: 'Points', group: 'Charts', description: 'A named list of [x, y] points for ScatterChart.',
    args: [req('name', str), req('points', list(list(num)))] },

  { name: 'Diagram', group: 'Relations', description: 'Boxes and arrows. Give no coordinates: the layout is automatic.',
    args: [req('nodes', list(node('Node'))), req('edges', list(node('Edge'))), opt('direction', enumOf('right', 'down')), opt('groups', list(node('Group')))] },
  { name: 'Node', group: 'Relations', description: 'A box of Diagram.',
    args: [req('id', str), req('title', str), opt('subtitle', str), opt('icon', str), opt('kind', enumOf('service', 'store', 'user', 'external', 'process', 'decision'))] },
  { name: 'Edge', group: 'Relations', description: 'An arrow between two Node ids.',
    args: [req('from', str), req('to', str), opt('label', str), opt('style', enumOf('solid', 'dashed'))] },
  { name: 'Group', group: 'Relations', description: 'A frame around several Node ids.',
    args: [req('id', str), req('title', str), req('nodeIds', list(str))] },

  { name: 'Steps', group: 'Guidance', description: 'An ordered procedure.',
    args: [req('items', list(node('Step')))] },
  { name: 'Step', group: 'Guidance', description: 'One step of Steps.',
    args: [req('title', str), opt('body', str), opt('status', enumOf('todo', 'doing', 'done', 'blocked'))] },
  { name: 'Checklist', group: 'Guidance', description: 'Items to tick.',
    args: [req('items', list(node('CheckItem')))] },
  { name: 'CheckItem', group: 'Guidance', description: 'One item of Checklist.',
    args: [req('text', str), opt('done', bool)] },
  { name: 'ProsCons', group: 'Guidance', description: 'Two lists, for and against.',
    args: [req('pros', list(str)), req('cons', list(str)), opt('title', str)] },

  { name: 'FileRef', group: 'Sources', description: 'A file or a place in a file; a click opens it in the app.',
    args: [req('path', str), opt('label', str), opt('page', num), opt('line', num)] },
  { name: 'Citation', group: 'Sources', description: 'A passage taken from a source, with its place.',
    args: [req('label', str), req('source', str), opt('quote', str), opt('page', num)] },
  { name: 'SourceList', group: 'Sources', description: 'The sources an answer relies on.',
    args: [req('sources', list(node('Source')))] },
  { name: 'Source', group: 'Sources', description: 'One source of SourceList.',
    args: [req('title', str), opt('url', str), opt('path', str), opt('note', str)] },
  { name: 'Link', group: 'Sources', description: 'A link to a web page.',
    args: [req('label', str), req('url', str)] },

  { name: 'Button', group: 'Interaction', description: 'A button that runs an action.',
    args: [req('label', str), req('action', action), opt('variant', enumOf('primary', 'secondary'))] },
  { name: 'Choices', group: 'Interaction', description: 'Suggested follow-ups under the answer. At most one per answer.',
    args: [req('options', list(node('Choice'))), opt('title', str)] },
  { name: 'Choice', group: 'Interaction', description: 'One follow-up of Choices.',
    args: [req('label', str), req('action', action)] }
]

export const CELL_COMPONENTS = ['Badge', 'FileRef', 'Link'] as const

export const SPEC_BY_NAME: ReadonlyMap<string, ComponentSpec> = new Map(
  COMPONENT_SPECS.map((spec) => [spec.name, spec])
)
