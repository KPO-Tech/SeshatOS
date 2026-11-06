import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import './gallery.css'
import { catalogLoader, i18nOptions } from '@renderer/i18n'
import { applyCurrentTheme, chooseMode, getEffectiveTheme } from '@renderer/lib/theme'
import { PROMPT_EXAMPLES } from '@renderer/components/chat/richblocks/catalog/examples'
import { RichBlock } from '@renderer/components/chat/richblocks/view/RichBlock'
import { RichActionProvider } from '@renderer/components/chat/richblocks/view/actions/richActions'
import { parseUi } from '@renderer/components/chat/richblocks/lang/parseUi'

// A page to look at every example of the catalogue as the chat draws it, in both themes and both languages, and to see what a click on a
// form, a quiz or a button would send. Run it with `npm run gallery`. It is a tool for the people who work on the components: the app
// does not ship it.

type Language = 'en' | 'fr'

function titleOf(code: string): string {
  const first = code.split('\n').find((line) => /^\w+\s*=/.test(line)) ?? ''
  return first.replace(/\s*=\s*/, ' = ').slice(0, 90)
}

function Gallery({ language }: { language: Language }) {
  const [sent, setSent] = useState<string[]>([])
  const [filter, setFilter] = useState(new URLSearchParams(window.location.search).get('filter') ?? '')
  const instance = React.useMemo(() => {
    const created = i18next.createInstance()
    void created.use(catalogLoader).init(i18nOptions(language))
    return created
  }, [language])
  const shown = PROMPT_EXAMPLES.map((code, index) => ({ code, index })).filter(({ code }) => code.toLowerCase().includes(filter.toLowerCase()))
  return (
    <I18nextProvider i18n={instance}>
      <RichActionProvider ask={(message) => setSent((previous) => [...previous, message])} busy={false}>
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-4 pb-40 pt-6 text-app-text">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter the examples (a component name)"
            className="rounded-lg border border-app-border-subtle bg-app-surface px-3 py-2 text-[13px] outline-none"
          />
          {shown.map(({ code, index }) => {
            const errors = parseUi(code, { streaming: false }).errors
            return (
              <section key={index} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-[12px] text-app-text-muted">
                  <span>{`#${index + 1} · ${titleOf(code)}`}</span>
                  <span className={errors.length > 0 ? 'text-app-error' : 'text-app-success'}>{errors.length > 0 ? `${errors.length} error(s)` : 'no error'}</span>
                </div>
                <RichBlock code={code} streaming={false} fallback={<pre className="text-xs">{code}</pre>} />
                {errors.length > 0 && <pre className="m-0 whitespace-pre-wrap text-[11.5px] text-app-error">{errors.map((error) => error.message).join('\n')}</pre>}
                <details className="text-[12px] text-app-text-muted">
                  <summary className="cursor-pointer">source</summary>
                  <pre className="whitespace-pre-wrap">{code}</pre>
                </details>
              </section>
            )
          })}
        </div>
        <div className="fixed inset-x-0 bottom-0 max-h-36 overflow-auto border-0 border-t border-solid border-app-border-subtle bg-app-surface-elevated px-4 py-2 text-[12px] text-app-text-secondary">
          <div className="mb-1 font-semibold text-app-text">What the chat would receive ({sent.length})</div>
          {sent.length === 0 ? <div className="text-app-text-muted">Nothing sent yet: click a button, a choice, a quiz report, a form.</div> : sent.map((message, i) => <pre key={i} className="m-0 mb-1 whitespace-pre-wrap">{message}</pre>)}
        </div>
      </RichActionProvider>
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
