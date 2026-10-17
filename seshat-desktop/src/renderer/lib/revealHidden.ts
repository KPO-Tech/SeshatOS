// Makes invisible and direction-changing characters visible in text a person is asked to approve.
//
// A command whose visible text is `ls` and whose real text is something else (direction overrides, tag characters,
// control characters: the "Trojan Source" family) cannot be approved by reading it. The runtime refuses such
// commands (internal/textsafe in seshat-runtime); this is the same rule for what the approval card shows, so a
// request that gets through another way is still readable as what it is.

const HIDDEN =
  // controls other than newline and tab, DEL, C1
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|\p{Cf}|[͏ᅟᅠ឴឵᠋-᠏ㅤ︀-️ﾠ￰-￸]|\p{Variation_Selector}/gu

/** Replaces each invisible or control character with «U+XXXX». Visible text, newlines and tabs are unchanged. */
export function revealHidden(text: string): string {
  return text.replace(HIDDEN, (ch) => {
    const code = ch.codePointAt(0) ?? 0
    return `«U+${code.toString(16).toUpperCase().padStart(4, '0')}»`
  })
}

/** True when the text holds a character that can make it read differently from what it does. */
export function hasHiddenCharacters(text: string): boolean {
  HIDDEN.lastIndex = 0
  const found = HIDDEN.test(text)
  HIDDEN.lastIndex = 0
  return found
}
