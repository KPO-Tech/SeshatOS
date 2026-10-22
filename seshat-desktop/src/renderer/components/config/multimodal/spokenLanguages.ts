export const AUTO_LANGUAGE = 'auto'

// Languages Whisper transcribes well, most spoken first. The tag is what the server expects.
export const SPOKEN_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'fr', label: 'French' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ru', label: 'Russian' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'th', label: 'Thai' },
  { value: 'sw', label: 'Swahili' },
  { value: 'yo', label: 'Yoruba' }
]

export function languageOptions() {
  return [
    { value: AUTO_LANGUAGE, label: 'Detect the language', description: 'Works for any language, but takes about twice as long' },
    ...SPOKEN_LANGUAGES.map((language) => ({ value: language.value, label: language.label }))
  ]
}
