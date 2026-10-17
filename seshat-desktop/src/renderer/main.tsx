import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tailwind.css'
import { App } from './App'
import { applyAppearance, getStoredAppearance } from './lib/appearance'
import { applyTheme, followSystemScheme, getStoredTheme } from './lib/theme'

applyTheme(getStoredTheme())
followSystemScheme()
applyAppearance(getStoredAppearance())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
