type HastNode = {
  tagName?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

/** True when a markdown `pre` holds a seshat-ui block: its components must not sit inside a monospace, unwrapped `pre`. */
export function isRichBlockNode(node: unknown): boolean {
  const code = (node as HastNode | undefined)?.children?.find((child) => child.tagName === 'code')
  const classes = code?.properties?.className
  return Array.isArray(classes) && classes.includes('language-seshat-ui')
}
