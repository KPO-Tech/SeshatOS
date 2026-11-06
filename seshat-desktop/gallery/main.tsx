import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import './gallery.css'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { applyCurrentTheme, chooseMode, getEffectiveTheme } from '@renderer/lib/theme'
import { EXAMPLE_TITLES, PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { MemoryRouter } from 'react-router'
import { ExampleGallery } from '@renderer/components/generative/ExampleGallery'
import { GenerativeUiModal, type SectionId } from '@renderer/components/generative/GenerativeUiModal'

// A page to look at every example of the catalogue as the chat draws it, in both themes and both languages, and to see what a click on a
// form, a quiz or a button would send. Run it with `npm run gallery`. It is a tool for the people who work on the components: the app
// does not ship it.

type Language = 'en' | 'fr'

const LOGO_CHECK = 'root = Stack([Browser([Logos(["aws", "aws lambda", "aws s3", "azure", "google cloud", "microsoft", "slack", "linkedin"], "Logos found by name")], null, "#ffffff"), Browser([Logos(["aws", "github", "openai", "stripe", "nobody-knows"], "On a dark page")], null, "#111827")])'

function Gallery({ language }: { language: Language }) {
  const instance = React.useMemo(() => {
    const created = i18next.createInstance()
    void created.use(catalogLoader).init(i18nOptions(language))
    return created
  }, [language])
  const query = new URLSearchParams(window.location.search)
  if (query.get('modal') === '1') {
    // The window of the Generative UI as the app shows it, over an empty page.
    return (
      <I18nextProvider i18n={instance}>
        <MemoryRouter>
          <GenerativeUiModal onClose={() => undefined} initialSection={(query.get('section') as SectionId | null) ?? 'overview'} />
        </MemoryRouter>
      </I18nextProvider>
    )
  }
  return (
    <I18nextProvider i18n={instance}>
      <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 text-app-text">
        <ExampleGallery examples={[LOGO_CHECK, ...PROMPT_EXAMPLES]} titles={['Logos found by name', ...EXAMPLE_TITLES]} showErrors initialFilter={query.get('filter') ?? ''} initialView={(['preview', 'code', 'both'] as const).find((view) => view === query.get('view'))} />
      </div>
    </I18nextProvider>
  )
}

function App() {
  const [language, setLanguage] = useState<Language>(new URLSearchParams(window.location.search).get('lang') === 'fr' ? 'fr' : 'en')
  const [theme, setTheme] = useState(getEffectiveTheme())
  useEffect(() => {
    applyCurrentTheme()
  }, [])
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-0 border-b border-solid border-app-border-subtle bg-app-surface-elevated px-4 py-2 text-[12.5px] text-app-text">
        <span className="mr-auto font-semibold">Seshat UI gallery</span>
        <button type="button" className="cursor-pointer rounded-md border border-app-border-subtle bg-transparent px-2.5 py-1 text-app-text" onClick={() => setLanguage(language === 'en' ? 'fr' : 'en')}>
          {language === 'en' ? 'English' : 'Français'}
        </button>
        <button
          type="button"
          className="cursor-pointer rounded-md border border-app-border-subtle bg-transparent px-2.5 py-1 text-app-text"
          onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark'
            chooseMode(next)
            setTheme(next)
          }}
        >
          {theme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </div>
      <Gallery language={language} />
    </>
  )
}

const wanted = new URLSearchParams(window.location.search).get('theme')
if (wanted === 'light' || wanted === 'dark') chooseMode(wanted)
applyCurrentTheme()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
