// Whether the person is scrolling right now, anywhere in the window (wheel, touch, keys, a scrollbar dragged). An answer being written
// holds its updates meanwhile (see StreamPresenter): every update of the page takes the main thread for a moment, and a scroll that has
// to wait for it stutters and then jumps. Held for a few frames, the text arrives at once when the scroll stops.

const QUIET_AFTER_MS = 150

let lastScrollAt = 0

function note() {
  lastScrollAt = performance.now()
}

function noteKey(event: KeyboardEvent) {
  if (event.key === 'PageUp' || event.key === 'PageDown' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End' || event.key === ' ') note()
}

// A drag of a scrollbar: a move with a button held. The scroll event itself is not listened to: the conversation scrolls by itself to
// follow the answer, and holding updates on that would stall the answer it follows.
function notePointer(event: PointerEvent) {
  if (event.buttons !== 0) note()
}

if (typeof window !== 'undefined') {
  const options = { capture: true, passive: true } as const
  window.addEventListener('wheel', note, options)
  window.addEventListener('touchmove', note, options)
  window.addEventListener('pointermove', notePointer, options)
  window.addEventListener('keydown', noteKey, options)
}

export function isScrolling(): boolean {
  return performance.now() - lastScrollAt < QUIET_AFTER_MS
}
