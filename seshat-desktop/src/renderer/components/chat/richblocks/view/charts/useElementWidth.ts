import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** The width of an element, kept current: a chart draws itself at the width it is given. */
export function useElementWidth<T extends HTMLElement>(initial = 640): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
