import { locatePassage, unitsCovering, wordsOf } from './passageLocator'

export type Sheet = { name: string; rows: string[][] }

export type SheetPlace = { sheet: number; cells: Array<[row: number, column: number]> }

// The index writes a workbook as Markdown: "## Sheet name", then the rows as a table.
const SHEET_TITLE = /^##\s+(.+?)\s*$/gm

/** The names of the sheets a passage of a workbook starts or runs through, from the titles the index wrote in its text. */
export function sheetNamesIn(text: string): string[] {
  return Array.from(text.matchAll(SHEET_TITLE), (match) => match[1])
}

/** The passage as the cells show it: without the sheet titles and the separator line of the table. */
function cellText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^##\s+/.test(line.trim()) && !/^\|?\s*:?-{3,}/.test(line.trim()))
    .join('\n')
}

/**
 * The sheet and the cells that hold a passage of a workbook, or null when no sheet does. The sheets the passage names are the only ones
 * looked in; a passage that names none is looked for in all of them, and the sheet where it fits best is the one.
 */
export function locatePassageInSheets(sheets: readonly Sheet[], passage: string): SheetPlace | null {
  const wanted = wordsOf(cellText(passage))
  const named = new Set(sheetNamesIn(passage).map((name) => name.toLowerCase()))
  let bestRuns = 0
  let place: SheetPlace | null = null
  for (let index = 0; index < sheets.length; index++) {
    if (named.size > 0 && !named.has(sheets[index].name.toLowerCase())) continue
    const cells = sheets[index].rows.flatMap((row, r) => row.map((value, c) => ({ r, c, words: wordsOf(value) })))
    const located = locatePassage(cells.flatMap((cell) => cell.words), wanted)
    if (!located || located.runs <= bestRuns) continue
    bestRuns = located.runs
    const covered = unitsCovering(cells.map((cell) => cell.words.length), located.start, located.end)
    place = { sheet: index, cells: covered.map((unit) => [cells[unit].r, cells[unit].c]) }
  }
  return place
}
