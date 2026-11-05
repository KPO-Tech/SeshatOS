; The look of the Windows installer and uninstaller beyond the default pages: a dark welcome and finish page in the colours of the brand
; (the warm near-black of the dark theme, the warm off-white of its text), and our own words. electron-builder inserts these macros where
; the pages are declared, so the defines below apply to the pages declared after them.
;
; The words are in English and French (the installer takes the language of the system, see installerLanguages in package.json). The
; languages are not loaded yet where the pages are declared, so the texts are LangStrings numbered by language (1033 English, 1036 French)
; and the pages name them with $(...). A language the installer lacks falls back to English.

LangString SeshatWelcomeTitle 1033 "Welcome to SeshatOS"
LangString SeshatWelcomeTitle 1036 "Bienvenue dans SeshatOS"
LangString SeshatWelcomeText 1033 "Your AI workspace, running on your computer.$\r$\n$\r$\nThis wizard installs SeshatOS. It downloads nothing now: the first time you open it, you choose which local features to add (smart titles, voice dictation, scanned documents), or none.$\r$\n$\r$\nClick Next to continue."
LangString SeshatWelcomeText 1036 "Votre espace de travail IA, sur votre ordinateur.$\r$\n$\r$\nCet assistant installe SeshatOS. Rien n'est téléchargé maintenant : à la première ouverture, vous choisissez les fonctions locales à ajouter (titres intelligents, dictée vocale, documents numérisés), ou aucune.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
LangString SeshatFinishTitle 1033 "SeshatOS is installed"
LangString SeshatFinishTitle 1036 "SeshatOS est installé"
LangString SeshatFinishText 1033 "Open SeshatOS to finish setting it up. The features you pick are downloaded then, from 80 MB to about 1 GB each, and you can change them later in Config."
LangString SeshatFinishText 1036 "Ouvrez SeshatOS pour finir la configuration. Les fonctions choisies sont alors téléchargées (de 80 Mo à environ 1 Go chacune) et modifiables plus tard dans la configuration."

LangString SeshatUnWelcomeTitle 1033 "Remove SeshatOS"
LangString SeshatUnWelcomeTitle 1036 "Désinstaller SeshatOS"
LangString SeshatUnWelcomeText 1033 "This wizard removes SeshatOS from your computer.$\r$\n$\r$\nBefore it removes anything, it asks whether to keep your conversations, settings and downloaded models, or to delete them with the program.$\r$\n$\r$\nClick Next to continue."
LangString SeshatUnWelcomeText 1036 "Cet assistant supprime SeshatOS de votre ordinateur.$\r$\n$\r$\nAvant de supprimer quoi que ce soit, il demande si vous gardez vos conversations, réglages et modèles téléchargés, ou si vous les supprimez avec le programme.$\r$\n$\r$\nCliquez sur Suivant pour continuer."
LangString SeshatUnFinishTitle 1033 "SeshatOS is removed"
LangString SeshatUnFinishTitle 1036 "SeshatOS est désinstallé"
LangString SeshatUnFinishText 1033 "SeshatOS has been removed from your computer."
LangString SeshatUnFinishText 1036 "SeshatOS a été supprimé de votre ordinateur."

LangString SeshatKeepConversations 1033 "Your conversations, memories, settings, skills and downloaded models:"
LangString SeshatKeepConversations 1036 "Vos conversations, souvenirs, réglages, skills et modèles téléchargés :"
LangString SeshatKeepUpdates 1033 "The cache of the updates:"
LangString SeshatKeepUpdates 1036 "Le cache des mises à jour :"
LangString SeshatKeepCli 1033 "The Seshat command-line program:"
LangString SeshatKeepCli 1036 "Le programme en ligne de commande Seshat :"
LangString SeshatDeleteQuestion 1033 "Also delete what SeshatOS keeps on this computer?"
LangString SeshatDeleteQuestion 1036 "Supprimer aussi ce que SeshatOS conserve sur cet ordinateur ?"
LangString SeshatDeleteWarning 1033 "This cannot be undone. Choose No to keep it: a later install finds it again."
LangString SeshatDeleteWarning 1036 "Cette action est irréversible. Choisissez Non pour le garder : une installation ultérieure le retrouvera."

!macro customWelcomePage
  !define MUI_BGCOLOR "2B2521"
  !define MUI_TEXTCOLOR "F1DEC8"
  !define MUI_WELCOMEPAGE_TITLE "$(SeshatWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(SeshatWelcomeText)"
  !define MUI_FINISHPAGE_TITLE "$(SeshatFinishTitle)"
  !define MUI_FINISHPAGE_TEXT "$(SeshatFinishText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_BGCOLOR "2B2521"
  !define MUI_TEXTCOLOR "F1DEC8"
  !define MUI_WELCOMEPAGE_TITLE "$(SeshatUnWelcomeTitle)"
  !define MUI_WELCOMEPAGE_TEXT "$(SeshatUnWelcomeText)"
  !define MUI_FINISHPAGE_TITLE "$(SeshatUnFinishTitle)"
  !define MUI_FINISHPAGE_TEXT "$(SeshatUnFinishText)"
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
        StrCpy $R8 "$R8$\r$\n  - $(SeshatKeepConversations)$\r$\n      $PROFILE\.config\seshat"
      IfFileExists "$LOCALAPPDATA\seshat-desktop-updater\*.*" 0 +2
        StrCpy $R8 "$R8$\r$\n  - $(SeshatKeepUpdates)$\r$\n      $LOCALAPPDATA\seshat-desktop-updater"
      IfFileExists "$LOCALAPPDATA\Programs\seshat\*.*" 0 +2
        StrCpy $R8 "$R8$\r$\n  - $(SeshatKeepCli)$\r$\n      $LOCALAPPDATA\Programs\seshat"
      ${if} $R8 != ""
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(SeshatDeleteQuestion)$\r$\n$R8$\r$\n$\r$\n$(SeshatDeleteWarning)" IDNO seshatKeepData
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
