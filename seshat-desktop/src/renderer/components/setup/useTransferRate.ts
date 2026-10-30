import { useEffect, useRef, useState } from 'react'

const SMOOTHING = 0.25

// How fast the bytes arrive, smoothed so the figure and the time left do not jump with every update of the progress.
export function useTransferRate(receivedBytes: number): number {
  const [rate, setRate] = useState(0)
  const last = useRef<{ at: number; bytes: number } | null>(null)

  useEffect(() => {
    const now = Date.now()
    const previous = last.current
    last.current = { at: now, bytes: receivedBytes }
    if (!previous || receivedBytes <= previous.bytes || now <= previous.at) return
    const instant = ((receivedBytes - previous.bytes) / (now - previous.at)) * 1000
    setRate((current) => (current === 0 ? instant : current + SMOOTHING * (instant - current)))
  }, [receivedBytes])

  return rate
}
