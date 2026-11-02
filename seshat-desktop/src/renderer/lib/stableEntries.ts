import { useRef } from 'react'

type Kept<T> = Map<number, { json: string; value: T[] }>

/** The lists of map, each replaced by the one kept from before when its content is the same; and what to keep for the next call. */
export function stabilizeEntries<T>(map: Map<number, T[]>, previous: Kept<T>): { out: Map<number, T[]>; kept: Kept<T> } {
  const kept: Kept<T> = new Map()
  const out = new Map<number, T[]>()
  for (const [index, value] of map) {
    const json = JSON.stringify(value)
    const before = previous.get(index)
    const stable = before && before.json === json ? before.value : value
    kept.set(index, { json, value: stable })
    out.set(index, stable)
  }
  return { out, kept }
}

/**
 * The same map with each list kept identical (===) to the one of the previous render when its content did not change. The chat derives a
 * list per message (changed files, web sources) from the whole conversation, again at every streamed token; new arrays with the same
 * content defeated MessageItem's memo, and every message on screen was drawn again for each token, which made scrolling during a turn
 * stutter. Lists are small: comparing them as JSON is cheap next to drawing a message.
 */
export function useStableEntries<T>(map: Map<number, T[]>): Map<number, T[]> {
  const previous = useRef<Kept<T>>(new Map())
  const { out, kept } = stabilizeEntries(map, previous.current)
  previous.current = kept
  return out
}
