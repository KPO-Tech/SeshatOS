const TITLE_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5.5h12M4 10h8M4 14.5h5" />
    <path d="m13.5 13.5 3 3M16.5 13.5l-3 3" />
  </svg>
)

const VOICE_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
  </svg>
)

const SCAN_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.5 2.5h6l3.5 3.5v11a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z" />
    <path d="M11.5 2.5V6H15M7 10h6M7 13h4" />
  </svg>
)

export const COMPONENT_CARDS = {
  title: {
    title: 'Smart titles',
    tagline: 'Names your conversations for you, with a small model that runs beside the answer.',
    icon: TITLE_ICON
  },
  speech: {
    title: 'Voice dictation',
    tagline: 'Turns your voice into text on this computer, in about a hundred languages.',
    icon: VOICE_ICON
  },
  ocr: {
    title: 'Scanned documents',
    tagline: 'Reads scanned PDFs and photos of documents on this computer, so you can search them and ask questions about them.',
    icon: SCAN_ICON
  }
} as const

