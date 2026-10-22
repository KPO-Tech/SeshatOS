; The look of the Windows installer and uninstaller beyond the default pages: a dark welcome and finish page in the colours of the brand
; (the warm near-black of the dark theme, the warm off-white of its text), and our own words. electron-builder inserts these macros where
; the pages are declared, so the defines below apply to the pages declared after them.

!macro customWelcomePage
  !define MUI_BGCOLOR "2B2521"
  !define MUI_TEXTCOLOR "F1DEC8"
  !define MUI_WELCOMEPAGE_TITLE "Welcome to SeshatOS"
  !define MUI_WELCOMEPAGE_TEXT "Your AI workspace, running on your computer.$\r$\n$\r$\nThis wizard installs SeshatOS. The first time you open it, you choose which models to download (the voice and the titles), or none.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "SeshatOS is installed"
  !define MUI_FINISHPAGE_TEXT "Open SeshatOS to finish setting it up.$\r$\n$\r$\nYou can change everything you choose there later in Config."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_BGCOLOR "2B2521"
  !define MUI_TEXTCOLOR "F1DEC8"
  !define MUI_WELCOMEPAGE_TITLE "Remove SeshatOS"
  !define MUI_WELCOMEPAGE_TEXT "This wizard removes SeshatOS from your computer.$\r$\n$\r$\nYour conversations, settings and downloaded models are kept, so a later install finds them again.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "SeshatOS is removed"
  !define MUI_FINISHPAGE_TEXT "SeshatOS has been removed from your computer."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
