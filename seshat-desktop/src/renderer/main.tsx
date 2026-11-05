import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tailwind.css'
import { App } from './App'
import { applyAccent, getStoredAccent } from './lib/accent'
import { applyAppearance, getStoredAppearance } from './lib/appearance'
import { applyCurrentTheme, followSystemScheme } from './lib/theme'
import { initI18n } from './i18n'

applyCurrentTheme()
applyAccent(getStoredAccent())
followSystemScheme()
applyAppearance(getStoredAppearance())

// The catalogues are read before the first render, so no text is drawn in the wrong language and then replaced.
function render() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

initI18n().then(render, render)
