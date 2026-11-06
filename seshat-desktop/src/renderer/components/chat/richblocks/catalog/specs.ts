import type { ArgSpec, ArgType, ComponentSpec } from './types'
import { TONE_NAMES } from './tones'

const str: ArgType = { t: 'string' }
const num: ArgType = { t: 'number' }
const bool: ArgType = { t: 'boolean' }
const scalar: ArgType = { t: 'scalar' }
const cell: ArgType = { t: 'cell' }
const row: ArgType = { t: 'row' }
const action: ArgType = { t: 'action' }
const target: ArgType = { t: 'target' }
const icon: ArgType = { t: 'icon' }
const enumOf = (...values: string[]): ArgType => ({ t: 'enum', values })
const node = (...of: string[]): ArgType => ({ t: 'node', of: of.length > 0 ? of : undefined })
const list = (item: ArgType): ArgType => ({ t: 'list', item })

const req = (name: string, type: ArgType): ArgSpec => ({ name, type })
const opt = (name: string, type: ArgType): ArgSpec => ({ name, type, optional: true })

const tone = enumOf(...TONE_NAMES)
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
    args: [req('text', str), opt('level', num), opt('tone', tone)] },
  { name: 'Markdown', group: 'Text', description: 'A paragraph of plain text.',
    args: [req('text', str)] },
  { name: 'Callout', group: 'Text', description: 'A highlighted note: info, success, warning or danger.',
    args: [req('tone', tone), req('title', str), opt('body', str)] },
  { name: 'Badge', group: 'Text', description: 'A short status label.',
    args: [req('text', str), opt('tone', tone)] },
  { name: 'Quote', group: 'Text', description: 'A quotation with its source.',
    args: [req('text', str), opt('source', str)] },

  { name: 'Table', group: 'Data', description: 'Rows and columns. A cell is a text, a number, a Badge, an Item or a Cell; a row is a list of cells or a Row. Columns may be grouped under a heading with ColGroup.',
    args: [req('columns', list(node('Col', 'ColGroup'))), req('rows', list(row)), opt('caption', str), opt('sortable', bool), opt('striped', bool), opt('compact', bool)] },
  { name: 'Col', group: 'Data', description: 'A column of Table: its label, how its values are formatted, and a tone that tints the whole column.',
    args: [req('label', str), opt('kind', enumOf('text', 'number', 'percent', 'money', 'date')), opt('align', enumOf('left', 'right', 'center')), opt('tone', tone)] },
  { name: 'ColGroup', group: 'Data', description: 'A heading over several Cols of a Table.',
    args: [req('label', str), req('columns', list(node('Col'))), opt('tone', tone)] },
  { name: 'Row', group: 'Data', description: 'A row of a Table that is more than a list of cells: kind section is a title across the whole table, total is a bold closing row, header repeats the column heads.',
    args: [req('cells', list(cell)), opt('tone', tone), opt('kind', enumOf('normal', 'section', 'total', 'header'))] },
  { name: 'Cell', group: 'Data', description: 'One cell of a Table with its own colour, weight, alignment or size: colspan merges cells to the right, rowspan merges the cells below (leave them out of the next rows).',
    args: [req('content', cell), opt('tone', tone), opt('bold', bool), opt('colspan', num), opt('rowspan', num), opt('align', enumOf('left', 'right', 'center'))] },
  { name: 'Metric', group: 'Data', description: 'One figure with its label and its change.',
    args: [req('label', str), req('value', scalar), opt('delta', scalar), opt('trend', enumOf('up', 'down', 'flat')), opt('note', str), opt('tone', tone)] },
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
    args: [req('labels', list(str)), req('series', list(node('Series'))), opt('mode', enumOf('grouped', 'stacked')), opt('unit', str), opt('horizontal', bool), opt('title', str), opt('xLabel', str), opt('yLabel', str)] },
  { name: 'LineChart', group: 'Charts', description: 'Lines over ordered labels: a trend, a learning curve (loss and accuracy per epoch).',
    args: [req('labels', list(str)), req('series', list(node('Series'))), opt('unit', str), opt('title', str), opt('xLabel', str), opt('yLabel', str)] },
  { name: 'AreaChart', group: 'Charts', description: 'Filled lines over ordered labels.',
    args: [req('labels', list(str)), req('series', list(node('Series'))), opt('unit', str), opt('stacked', bool), opt('title', str), opt('xLabel', str), opt('yLabel', str)] },
  { name: 'PieChart', group: 'Charts', description: 'Shares of a whole.',
    args: [req('labels', list(str)), req('values', list(num)), opt('donut', bool), opt('title', str)] },
  { name: 'ScatterChart', group: 'Charts', description: 'Points on two axes, one colour per Points.',
    args: [req('series', list(node('Points'))), opt('xLabel', str), opt('yLabel', str), opt('title', str)] },
  { name: 'Series', group: 'Charts', description: 'A named list of values, one per label.',
    args: [req('name', str), req('values', list(num)), opt('tone', tone)] },
  { name: 'Points', group: 'Charts', description: 'A named list of [x, y] points, for ScatterChart or a Plot; line joins them in order (a path, an ROC curve).',
    args: [req('name', str), req('points', list(list(num))), opt('tone', tone), opt('line', bool)] },
  { name: 'Plot', group: 'Charts', description: 'A graph of formulas in x over [xmin, xmax], with the layers drawn on the same axes. The vertical range is automatic unless given.',
    args: [req('layers', list(node('Curve', 'Shade', 'Dot', 'VLine', 'HLine', 'Points'))), req('xmin', num), req('xmax', num), opt('ymin', num), opt('ymax', num), opt('title', str), opt('xLabel', str), opt('yLabel', str)] },
  { name: 'Curve', group: 'Charts', description: 'A formula in x (x^3 - 3x + 1, sin(2x)/x, e^(-x^2); + - * / ^, sin cos tan exp ln sqrt abs, pi, e). op derivative draws its derivative and integral its antiderivative from xmin, both computed numerically.',
    args: [req('expr', str), opt('label', str), opt('tone', tone), opt('dashed', bool), opt('op', enumOf('value', 'derivative', 'integral')), opt('show', scalar)] },
  { name: 'Shade', group: 'Charts', description: 'The area between a formula and the x axis from one bound to another; the legend gives its value (the definite integral).',
    args: [req('expr', str), req('from', scalar), req('to', scalar), opt('label', str), opt('tone', tone), opt('show', scalar)] },
  { name: 'Dot', group: 'Charts', description: 'A marked point of a Plot (a root, an extremum, an inflection point), with its label. x and y may be formulas in the sliders ("-b/(2*a)") to follow them; so may the bound of a VLine, HLine or Shade.',
    args: [req('x', scalar), req('y', scalar), opt('label', str), opt('tone', tone), opt('show', scalar)] },
  { name: 'VLine', group: 'Charts', description: 'A vertical guide of a Plot at x (an asymptote, a bound).',
    args: [req('x', scalar), opt('label', str), opt('tone', tone), opt('show', scalar)] },
  { name: 'HLine', group: 'Charts', description: 'A horizontal guide of a Plot at y (an asymptote, a threshold, a mean).',
    args: [req('y', scalar), opt('label', str), opt('tone', tone), opt('show', scalar)] },
  { name: 'Slider', group: 'Charts', description: 'A slider the reader moves to change a variable (name: a, b, h, amp; not x, e, pi) that the formulas of Curve, Shade and Live use.',
    args: [req('name', str), req('min', num), req('max', num), opt('value', num), opt('step', num), opt('label', str)] },
  { name: 'Toggle', group: 'Charts', description: 'A switch: a variable, 1 when on and 0 when off (value true starts it on).',
    args: [req('name', str), opt('label', str), opt('value', bool)] },
  { name: 'Select', group: 'Charts', description: 'A list of choices: the variable is the number of the choice made, from 0.',
    args: [req('name', str), req('options', list(str)), opt('value', num), opt('label', str)] },
  { name: 'Live', group: 'Charts', description: 'Markdown text where {{formula}} shows its value with the current sliders: "$f(x) = {{a}}x^2$", "vertex ({{h}}, {{k}})", "{{2*a+b}}". Write * between a number and a variable.',
    args: [req('text', str)] },
  { name: 'Histogram', group: 'Charts', description: 'The distribution of a list of values, in equal bins (a residual, a feature, a weight).',
    args: [req('values', list(num)), opt('bins', num), opt('title', str), opt('xLabel', str), opt('tone', tone)] },
  { name: 'Heatmap', group: 'Charts', description: 'A grid of numbers shaded by value: a confusion matrix, a correlation matrix, an attention map.',
    args: [req('rows', list(str)), req('cols', list(str)), req('values', list(list(num))), opt('title', str), opt('tone', tone), opt('decimals', num)] },

  { name: 'Diagram', group: 'Relations', description: 'Boxes and arrows. Give no coordinates: the layout is automatic.',
    args: [req('nodes', list(node('Node'))), req('edges', list(node('Edge'))), opt('direction', enumOf('right', 'down')), opt('groups', list(node('Group')))] },
  { name: 'Node', group: 'Relations', description: 'A box of Diagram.',
    args: [req('id', str), req('title', str), opt('subtitle', str), opt('icon', str), opt('kind', enumOf('service', 'store', 'user', 'external', 'process', 'decision'))] },
  { name: 'Edge', group: 'Relations', description: 'An arrow between two Node ids.',
    args: [req('from', str), req('to', str), opt('label', str), opt('style', enumOf('solid', 'dashed'))] },
  { name: 'Group', group: 'Relations', description: 'A frame around several Node ids.',
    args: [req('id', str), req('title', str), req('nodeIds', list(str))] },

  { name: 'Architecture', group: 'Architecture', description: 'The frame of a system drawing: it lays Panels out and draws the Flow arrows over them.',
    args: [req('children', list(anyNode)), opt('flows', list(node('Flow'))), opt('title', str)] },
  { name: 'Panel', group: 'Architecture', description: 'A coloured box with a title and an icon that holds Items or other Panels, in a column or in a wrapping row. Give it its own name to link it with a Flow.',
    args: [req('children', list(anyNode)), opt('title', str), opt('tone', tone), opt('icon', icon), opt('dashed', bool), opt('direction', enumOf('column', 'row'))] },
  { name: 'Item', group: 'Architecture', description: 'A line with an icon, a label and a caption; boxed draws it as a card. Give it its own name to link it with a Flow.',
    args: [req('label', str), opt('icon', icon), opt('caption', str), opt('boxed', bool), opt('tone', tone)] },
  { name: 'Flow', group: 'Architecture', description: 'An arrow between two Panels or Items, by the names of their statements. Only inside the flows of an Architecture.',
    args: [req('from', target), req('to', target), opt('label', str), opt('both', bool), opt('style', enumOf('solid', 'dashed'))] },

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
    args: [req('title', str), opt('url', str), opt('path', str), opt('note', str), opt('site', str)] },
  { name: 'SourcePills', group: 'Sources', description: 'Pills for the sites a web search drew from.',
    args: [req('sources', list(node('Source')))] },
  { name: 'Link', group: 'Sources', description: 'A link to a web page.',
    args: [req('label', str), req('url', str)] },

  { name: 'Button', group: 'Interaction', description: 'A button that runs an action.',
    args: [req('label', str), req('action', action), opt('variant', enumOf('primary', 'secondary'))] },
  { name: 'Choices', group: 'Interaction', description: 'Suggested follow-ups under the answer. At most one per answer.',
    args: [req('options', list(node('Choice'))), opt('title', str)] },
  { name: 'Choice', group: 'Interaction', description: 'One follow-up of Choices; a description makes it a card.',
    args: [req('label', str), req('action', action), opt('description', str), opt('icon', icon)] },

  { name: 'Form', group: 'Forms', description: 'Lets the reader answer inside the answer: fields, a Counter, then one Submit that sends their text back to you as their next message. For an exercise, a quiz, a text to correct. One per answer; never ask for a secret.',
    args: [req('children', list(anyNode)), req('submit', node('Submit')), opt('title', str)] },
  { name: 'TextArea', group: 'Forms', description: 'A box for a longer text, inside a Form. name is how a template refers to it; value is the text it starts with.',
    args: [req('name', str), opt('placeholder', str), opt('rows', num), opt('value', str)] },
  { name: 'Field', group: 'Forms', description: 'A single line to fill in, inside a Form.',
    args: [req('name', str), opt('label', str), opt('placeholder', str), opt('value', str)] },
  { name: 'Counter', group: 'Forms', description: 'Counts the words of a field (of is its name); min and max colour it. unit is the word for the count, in the language of the reader.',
    args: [req('of', str), opt('unit', str), opt('min', num), opt('max', num)] },
  { name: 'Submit', group: 'Forms', description: 'The button of a Form. template is the message you will receive, written as the reader would, with {{name}} where the text of a field goes. Disabled until the fields in requires (all by default) are filled.',
    args: [req('label', str), req('template', str), opt('requires', list(str))] },
  { name: 'Quiz', group: 'Forms', description: 'Multiple-choice questions answered in the answer, judged at once with their explanation, then a score. Optional report: the message the reader may send at the end, with {{score}}, {{total}}, {{missed}}. The answers are visible: a study tool, not an exam.',
    args: [req('questions', list(node('Question'))), opt('title', str), opt('report', str)] },
  { name: 'Question', group: 'Forms', description: 'A question of a Quiz: 2 to 6 options; answer is the number of the right one, counting from 0.',
    args: [req('text', str), req('options', list(str)), req('answer', num), opt('explanation', str)] },
  { name: 'Flashcards', group: 'Forms', description: 'Cards the reader flips and marks known or to review. Optional report, with {{known}}, {{total}}, {{again}} (fronts to review).',
    args: [req('cards', list(node('Flash'))), opt('title', str), opt('report', str)] },
  { name: 'Flash', group: 'Forms', description: 'A card: front (a word), back (the answer), tag on the front (a category), note under the back (a pronunciation, an example).',
    args: [req('front', str), req('back', str), opt('tag', str), opt('note', str)] },
  { name: 'Browser', group: 'Design', description: 'A browser window to sketch a page in: put a Nav, a Hero, Features, a Grid, Pictures and a Footer inside. bg is the colour of the page as a hex code (#fff).',
    args: [req('children', list(anyNode)), opt('url', str), opt('bg', str)] },
  { name: 'Nav', group: 'Design', description: 'The navigation bar of a page: brand, links, a call to action. color is a hex code.',
    args: [req('brand', str), opt('links', list(str)), opt('cta', str), opt('color', str)] },
  { name: 'Hero', group: 'Design', description: 'The top of a page: a title on a gradient of color (a hex code), a subtitle, two buttons. The text takes a readable colour by itself.',
    args: [req('title', str), opt('subtitle', str), opt('primary', str), opt('secondary', str), opt('color', str), opt('align', enumOf('center', 'left'))] },
  { name: 'Features', group: 'Design', description: 'A grid of Feature cards (columns 1 to 4).',
    args: [req('items', list(node('Feature'))), opt('columns', num)] },
  { name: 'Feature', group: 'Design', description: 'A card of Features: title, text, an icon, a hex color.',
    args: [req('title', str), opt('text', str), opt('icon', icon), opt('color', str)] },
  { name: 'Grid', group: 'Design', description: 'Its children in 1 to 4 equal columns (a gallery, prices, two columns of text).',
    args: [req('children', list(anyNode)), opt('columns', num)] },
  { name: 'Picture', group: 'Design', description: 'A picture placeholder: a gradient of color with an optional label; ratio is width over height.',
    args: [opt('label', str), opt('color', str), opt('ratio', num)] },
  { name: 'Palette', group: 'Design', description: 'The colours of a design, each with its name and its hex code.',
    args: [req('swatches', list(node('Swatch'))), opt('title', str)] },
  { name: 'Swatch', group: 'Design', description: 'A colour of a Palette: a hex code and its name.',
    args: [req('color', str), opt('name', str)] },
  { name: 'Footer', group: 'Design', description: 'The foot of a page: a line of text and a few links.',
    args: [req('text', str), opt('links', list(str))] },
  { name: 'Draft', group: 'Forms', description: 'A text the reader can edit and copy: an email, a letter. subject and to are optional lines above the body.',
    args: [req('body', str), opt('subject', str), opt('to', str), opt('title', str)] },
  { name: 'ProgressBar', group: 'Forms', description: 'A bar filled to value out of max (100 by default): a score, a level, a completion.',
    args: [req('value', num), opt('max', num), opt('label', str), opt('tone', tone)] },
  { name: 'SegmentBar', group: 'Forms', description: 'A bar cut in parts in proportion to their value: how a session or a budget is shared. unit follows each figure (min, h, EUR).',
    args: [req('segments', list(node('Segment'))), opt('unit', str), opt('title', str)] },
  { name: 'Segment', group: 'Forms', description: 'One part of SegmentBar: its label (what it is) and its value (the figure, in the unit of the bar).',
    args: [req('label', str), req('value', num), opt('tone', tone)] }
]

// What a table cell may hold besides text and numbers.
export const CELL_COMPONENTS = ['Badge', 'Item', 'Cell', 'FileRef', 'Link'] as const

export const SPEC_BY_NAME: ReadonlyMap<string, ComponentSpec> = new Map(
  COMPONENT_SPECS.map((spec) => [spec.name, spec])
)
