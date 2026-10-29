const SVG_NS = 'http://www.w3.org/2000/svg'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

/** Marks what a copy of a figure leaves out: a hover tooltip, a button. */
export const EXPORT_SKIP = 'data-export-skip'

export type FigureImage = { svg: string; width: number; height: number }

/** What the browser gives an element with no stylesheet at all, so that only what the app changed is written onto the copy. */
function pristine(): Document {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  return frame.contentDocument as Document
}

function inlineStyles(source: Element, copy: Element, clean: Document, defaults: Map<string, CSSStyleDeclaration>) {
  const computed = getComputedStyle(source)
  const key = `${source.namespaceURI}|${source.localName}`
  let base = defaults.get(key)
  if (!base) {
    const probe = clean.createElementNS(source.namespaceURI, source.localName)
    clean.body.appendChild(probe)
    base = clean.defaultView!.getComputedStyle(probe)
    defaults.set(key, base)
  }
  const names = Array.from(computed).filter((name) => !name.startsWith('--'))
  // A border width means nothing without its style: when one is drawn, the whole border is written.
  const bordered = names.some((name) => /^border-.*-style$/.test(name) && computed.getPropertyValue(name) !== 'none')
  const parts: string[] = []
  for (const name of names) {
    const value = computed.getPropertyValue(name)
    if (value !== base.getPropertyValue(name) || (bordered && name.startsWith('border'))) parts.push(`${name}:${value}`)
  }
  ;(copy as HTMLElement).setAttribute('style', parts.join(';'))
  const from = Array.from(source.children)
  const into = Array.from(copy.children)
  from.forEach((child, index) => inlineStyles(child, into[index], clean, defaults))
}

function withoutSkipped(copy: Element) {
  copy.querySelectorAll(`[${EXPORT_SKIP}]`).forEach((node) => node.remove())
}

/** The background a figure sits on: the first opaque colour found going up from it. */
function backdrop(element: Element): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (color && color !== 'transparent' && !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(color)) return color
  }
  return '#ffffff'
}

/** A picture of an element as one SVG that looks the same: every style is written onto the copy, so it needs no stylesheet. */
export function figureToSvg(element: HTMLElement): FigureImage {
  const width = Math.ceil(Math.max(element.scrollWidth, element.offsetWidth))
  const height = Math.ceil(Math.max(element.scrollHeight, element.offsetHeight))
  const copy = element.cloneNode(true) as HTMLElement
  const clean = pristine()
  try {
    inlineStyles(element, copy, clean, new Map())
  } finally {
    clean.defaultView?.frameElement?.remove()
  }
  withoutSkipped(copy)
  copy.setAttribute('xmlns', XHTML_NS)
  copy.style.margin = '0'
  copy.style.width = `${width}px`
  copy.style.height = `${height}px`

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  const background = document.createElementNS(SVG_NS, 'rect')
  background.setAttribute('width', '100%')
  background.setAttribute('height', '100%')
  background.setAttribute('fill', backdrop(element))
  const frame = document.createElementNS(SVG_NS, 'foreignObject')
  frame.setAttribute('width', '100%')
  frame.setAttribute('height', '100%')
  frame.appendChild(copy)
  svg.append(background, frame)
  return { svg: new XMLSerializer().serializeToString(svg), width, height }
}

export function fileSafeName(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, 60) || 'figure'
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadSvg(element: HTMLElement, name: string) {
  const { svg } = figureToSvg(element)
  save(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' }), `${fileSafeName(name)}.svg`)
}

/** Draws the figure at twice its size, which is sharp on a high-density screen and when printed. */
export async function downloadPng(element: HTMLElement, name: string, scale = 2) {
  const { svg, width, height } = figureToSvg(element)
  const image = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('The figure could not be drawn as an image'))
  })
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas to draw on')
  context.scale(scale, scale)
  context.drawImage(image, 0, 0, width, height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The image could not be saved')
  save(blob, `${fileSafeName(name)}.png`)
}
