import type { ProjectColor } from '@renderer/lib/projects'

// The colour of a project's tile and of its folder icon. Orange is the accent of the theme in use; the others stay the same in every theme
// and are soft enough to sit on a dark or a light surface (the tile is the colour at a low strength over the card).
export const PROJECT_COLOR_VALUE: Record<ProjectColor, string> = {
  orange: 'var(--accent-primary)',
  blue: '#4f8cff',
  purple: '#c26df0',
  green: '#34c795',
  yellow: '#f2b429',
  gray: '#98a1b0'
}

export const PROJECT_COLOR_LABEL: Record<ProjectColor, string> = {
  orange: 'Orange',
  blue: 'Blue',
  purple: 'Purple',
  green: 'Green',
  yellow: 'Yellow',
  gray: 'Grey'
}

/** The tile behind a folder icon: the colour, faint. */
export function tileBackground(color: ProjectColor): string {
  return `color-mix(in srgb, ${PROJECT_COLOR_VALUE[color]} 18%, transparent)`
}
