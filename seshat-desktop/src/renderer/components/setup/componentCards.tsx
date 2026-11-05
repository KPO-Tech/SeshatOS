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
    title: 'shell:setup.componentCards.titleTitle',
    tagline: 'shell:setup.componentCards.titleTagline',
    icon: TITLE_ICON
  },
  speech: {
    title: 'shell:setup.componentCards.speechTitle',
    tagline: 'shell:setup.componentCards.speechTagline',
    icon: VOICE_ICON
  },
  ocr: {
    title: 'shell:setup.componentCards.ocrTitle',
    tagline: 'shell:setup.componentCards.ocrTagline',
    icon: SCAN_ICON
  }
} as const

