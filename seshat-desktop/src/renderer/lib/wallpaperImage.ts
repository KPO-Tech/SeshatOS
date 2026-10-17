// Turns a picture the person chose into a wallpaper that is small enough to keep: at most 1600 px wide, re-encoded as JPEG
// and shrunk further until its data URL is under the limit customThemes.ts accepts. Browser only (canvas).

const MAX_SOURCE_BYTES = 12 * 1024 * 1024
const MAX_WIDTH = 1600
const MAX_DATA_URL_CHARS = 1_200_000
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export async function fileToWallpaperDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('This picture is larger than 12 MB. Choose a smaller one.')
  const bitmap = await createImageBitmap(file)
  try {
    let width = Math.min(MAX_WIDTH, bitmap.width)
    for (let attempt = 0; attempt < 6; attempt++) {
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This picture could not be prepared.')
      context.drawImage(bitmap, 0, 0, width, height)
      const url = canvas.toDataURL('image/jpeg', attempt < 3 ? 0.82 : 0.7)
      if (url.length <= MAX_DATA_URL_CHARS) return url
      width = Math.round(width * 0.75)
    }
    throw new Error('This picture is too detailed to keep as a wallpaper. Choose a simpler one.')
  } finally {
    bitmap.close()
  }
}
