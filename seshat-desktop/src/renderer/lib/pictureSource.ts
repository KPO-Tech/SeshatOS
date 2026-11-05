// A <picture> in a README names one image per colour scheme (a logo for dark pages, another for light ones). A browser picks among its
// <source> elements by itself and reads the address against the app, not against the folder of the page, so the picture of a folder
// never loads. The page chooses instead: the source for the theme on screen, or the plain <img> when none applies.

import type { ColorScheme } from './themes'

type HastNode = { tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] }

export type PictureChoice = {
  src: string
  alt?: string
  width?: number | string
  height?: number | string
}

/** The first address of a srcset ("a.svg 1x, b.svg 2x" gives "a.svg"). */
function firstAddress(srcSet: unknown): string | null {
  const text = Array.isArray(srcSet) ? srcSet.join(',') : typeof srcSet === 'string' ? srcSet : ''
  const address = text.split(',')[0]?.trim().split(/\s+/)[0]
  return address || null
}

/** A source without a condition always applies; one that asks for a scheme applies to that scheme; any other condition is ignored. */
function appliesTo(media: unknown, scheme: ColorScheme): boolean {
  if (typeof media !== 'string' || media.trim() === '') return true
  const asked = /prefers-color-scheme\s*:\s*(dark|light)/i.exec(media)
  return asked ? asked[1].toLowerCase() === scheme : false
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function size(value: unknown): number | string | undefined {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

/** The image a <picture> shows for a scheme, or null when it has no <img> to fall back on. */
export function pictureChoice(node: HastNode | undefined, scheme: ColorScheme): PictureChoice | null {
  const children = node?.children ?? []
  const img = children.find((child) => child.tagName === 'img')
  if (!img) return null
  const source = children.find((child) => child.tagName === 'source' && appliesTo(child.properties?.media, scheme) && firstAddress(child.properties?.srcSet))
  const src = firstAddress(source?.properties?.srcSet) ?? text(img.properties?.src)
  if (!src) return null
  return { src, alt: text(img.properties?.alt), width: size(img.properties?.width), height: size(img.properties?.height) }
}
