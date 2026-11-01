; The look of the Windows installer and uninstaller beyond the default pages: a dark welcome and finish page in the colours of the brand
; (the warm near-black of the dark theme, the warm off-white of its text), and our own words. electron-builder inserts these macros where
; the pages are declared, so the defines below apply to the pages declared after them.

!macro customWelcomePage
  !define MUI_BGCOLOR "2B2521"
  !define MUI_TEXTCOLOR "F1DEC8"
  !define MUI_WELCOMEPAGE_TITLE "Welcome to SeshatOS"
  !define MUI_WELCOMEPAGE_TEXT "Your AI workspace, running on your computer.$\r$\n$\r$\nThis wizard installs SeshatOS. It downloads nothing now: the first time you open it, you choose which local features to add (smart titles, voice dictation, scanned documents), or none.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "SeshatOS is installed"
  !define MUI_FINISHPAGE_TEXT "Open SeshatOS to finish setting it up. The features you pick are downloaded then, from 80 MB to about 1 GB each, and you can change them later in Config."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_BGCOLOR "2B2521"
  !define MUI_TEXTCOLOR "F1DEC8"
  !define MUI_WELCOMEPAGE_TITLE "Remove SeshatOS"
  !define MUI_WELCOMEPAGE_TEXT "This wizard removes SeshatOS from your computer.$\r$\n$\r$\nBefore it removes anything, it asks whether to keep your conversations, settings and downloaded models, or to delete them with the program.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "SeshatOS is removed"
  !define MUI_FINISHPAGE_TEXT "SeshatOS has been removed from your computer."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Asked once, as the program is removed: keep what SeshatOS holds on this computer (a later install finds it again), or delete it too, so that
; nothing is left behind. The default is to keep, and nothing is asked, nor deleted, when the uninstaller runs silently or as the first step of
; an update. Everything the app writes lives in the runtime folder (the database, the conversations, the models, the environments of the
; skills, the session and the logs of the window), plus the cache the updater downloads into. The command-line Seshat installs beside the app
; and shares the runtime folder with it: it is listed in the question, so that nobody loses it without having been told.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${ifNot} ${Silent}
      SetShellVarContext current
      StrCpy $R8 ""
      IfFileExists "$PROFILE\.config\seshat\*.*" 0 +2
        StrCpy $R8 "$R8$\r$\n  - Your conversations, memories, settings, skills and downloaded models:$\r$\n      $PROFILE\.config\seshat"
      IfFileExists "$LOCALAPPDATA\seshat-desktop-updater\*.*" 0 +2
        StrCpy $R8 "$R8$\r$\n  - The cache of the updates:$\r$\n      $LOCALAPPDATA\seshat-desktop-updater"
      IfFileExists "$LOCALAPPDATA\Programs\seshat\*.*" 0 +2
        StrCpy $R8 "$R8$\r$\n  - The Seshat command-line program:$\r$\n      $LOCALAPPDATA\Programs\seshat"
      ${if} $R8 != ""
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete what SeshatOS keeps on this computer?$\r$\n$R8$\r$\n$\r$\nThis cannot be undone. Choose No to keep it: a later install finds it again." IDNO seshatKeepData
          RMDir /r "$PROFILE\.config\seshat"
          RMDir /r "$LOCALAPPDATA\seshat-desktop-updater"
          RMDir /r "$LOCALAPPDATA\Programs\seshat"
        seshatKeepData:
      ${endIf}
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endIf}
    ${endIf}
  ${endIf}
!macroend
