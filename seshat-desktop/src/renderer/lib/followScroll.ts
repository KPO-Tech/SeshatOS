/** How near the end the reader must be for the conversation to follow its end again. */
export const FOLLOW_DISTANCE = 60

/**
 * Whether the chat keeps following its end after a scroll event. Only the reader's own move stops it. The distance to the end alone says
 * nothing: while an answer is written the content grows between two frames, so the chat's own scroll, and the jump of the button that goes
 * back down, land more than a few lines short of the end; reading that as the reader leaving stopped the follow with nobody touching
 * anything. The chat only ever scrolls down, so a move up is the reader's (wheel, scrollbar, a selection dragged up).
 */
export function followAfterScroll(following: boolean, move: { top: number; lastTop: number; distance: number }): boolean {
  if (move.top < move.lastTop && move.distance > FOLLOW_DISTANCE) return false
  if (move.top > move.lastTop && move.distance <= FOLLOW_DISTANCE) return true
  return following
}
