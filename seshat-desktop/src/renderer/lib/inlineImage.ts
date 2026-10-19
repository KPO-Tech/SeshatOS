// Message markdown is model output, and model output may be influenced by
// untrusted content the agent fetched earlier in the conversation. A remote
// image is the one markdown construct that makes the renderer fetch a
// third-party URL on its own, exposing the user's IP and the existence of the
// conversation to whoever hosts it. Only inline data URLs are therefore drawn
// as images; everything else is shown as a chip the user has to click, and
// that click routes through the app browser like any other link.
export function isRenderableImageSrc(src: string): boolean {
  return /^data:image\//i.test(src)
}

export function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src)
}
