import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tailwind.css'
import { App } from './App'
import { applyAccent, getStoredAccent } from './lib/accent'
import { applyAppearance, getStoredAppearance } from './lib/appearance'
import { applyCurrentTheme, followSystemScheme } from './lib/theme'

applyCurrentTheme()
applyAccent(getStoredAccent())
followSystemScheme()
applyAppearance(getStoredAppearance())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
