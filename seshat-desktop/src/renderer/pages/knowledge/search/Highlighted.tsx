import { highlight } from './highlight'

/** A text with the words of the query marked. */
export function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlight(text, terms).map((segment, index) =>
        segment.hit ? (
          <mark key={index} className="rounded-[3px] bg-[color-mix(in_srgb,var(--accent-primary)_24%,transparent)] px-px text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  )
}
