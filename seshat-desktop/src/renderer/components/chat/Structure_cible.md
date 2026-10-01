# Structure cible du chat desktop

Ce document est la boussole de la refonte du chat desktop.

L'objectif n'est pas de tout reecrire. L'objectif est de restructurer le code existant pour qu'il devienne lisible, maintenable et extensible, sans regression fonctionnelle.

## Regle principale

La migration doit se faire sans perte.

Concretement :

- ne pas changer le comportement utilisateur pendant les deplacements ;
- ne pas supprimer une logique tant que son equivalent n'existe pas dans la nouvelle structure ;
- ne pas migrer plusieurs responsabilites critiques dans la meme etape ;
- garder des wrappers temporaires seulement quand ils protegent encore des imports actifs ;
- supprimer les wrappers morts une fois les imports migres vers leur dossier cible ;
- valider chaque phase avec `npm run typecheck`.

## Probleme actuel

La structure actuelle contient deja de bons composants, mais l'orchestration est encore trop concentree dans quelques fichiers :

- `pages/Conversation.tsx` gere trop de responsabilites : page, providers, modeles, attachments, scroll, panels, actions et styles.
- `hooks/useChat.ts` melange transport stream, runtime events, permissions, retry, watchdog, plans et subagents.
- `stores/session.ts` melange sessions, messages, streaming, agents, plans et subagents.

La refonte doit donc separer les responsabilites sans casser le flux existant.

## Structure cible

```txt
src/renderer/components/chat/
  conversation/
    ConversationPage.tsx
    ConversationHeader.tsx
    ConversationEmpty.tsx
    useConversationSession.ts
    useConversationModels.ts
    useConversationScroll.ts

  composer/
    ChatInput.tsx
    useDraftAttachments.ts
    composerTypes.ts

  messages/
    MessageList.tsx
    MessageItem.tsx
    PlanArtifactCard.tsx
    liveActivity.ts
    messageGuards.ts

  attachments/
    attachmentTypes.ts
    attachmentPreview.ts
    attachmentUpload.ts
    previews/

  streaming/
    useChatStream.ts
    streamTransport.ts
    streamPresenter.ts
    runtimeEvents.ts
    streamReducers.ts
    streamCommit.ts
    chatControllers.ts

  state/
    sessionTypes.ts
    sessionStoreTypes.ts
    sessionCollectionState.ts
    streamingState.ts
    streamingContent.ts
    agentState.ts
    planState.ts
    subagentState.ts
    sessionStore.ts
    agentTypes.ts
    planTypes.ts
    subagentTypes.ts

  tools/
    ToolBlock.tsx
    QuietToolGroup.tsx
    PermissionCard.tsx
    AgentToolView.tsx
    thinkingMarkdownClass.ts
    types.ts
    toolDisplay.tsx
    quietGroupPhrase.ts
    helpers.tsx
    common.tsx
    DiffView.tsx
    ToolLineItem.tsx
    renderers/
    live/  (differe - voir Phase 6)

  panels/
    RightPanelHost.tsx
    AgentWorkspacePanel.tsx
    ArtifactPreviewPanel.tsx
    BrowserPanel.tsx
    PDFViewerPanel.tsx
    DocxPreviewPanel.tsx
    XlsxPreviewPanel.tsx
    PptxPreviewPanel.tsx
    KnowledgePanel.tsx
    EmptyState.tsx
    PlanPanel.tsx
    AskUserPanel.tsx
    SubagentPanel.tsx
```

## Role des dossiers

### `conversation/`

Contient la page de conversation et ses hooks d'orchestration visibles.

Ce dossier doit piloter l'ecran, pas contenir la logique profonde du streaming ou des stores.

### `composer/`

Contient la zone de saisie, les brouillons, les fichiers attaches avant envoi et les types propres au composer.

### `messages/`

Contient l'affichage de la liste de messages, les composants de message et les helpers d'affichage.

Ce dossier ne doit pas connaitre les details du transport stream.

### `attachments/`

Contient la classification, la preparation, l'upload et les previews des fichiers.

La logique PDF, Office, image et fichier texte doit finir ici au lieu de rester dans `Conversation.tsx`.

### `streaming/`

Contient le coeur technique du chat en temps reel :

- transport HTTP ou Electron ;
- parsing des evenements ;
- reduction des runtime events ;
- gestion du payload final ;
- controleurs abort/retry/watchdog.

C'est le dossier le plus sensible. Il doit etre migre par petites etapes.

### `state/`

Contient les types et stores lies au domaine chat.

Le but n'est pas forcement de creer beaucoup de stores immediatement. On peut commencer par extraire les types, puis decouper progressivement le store session.

### `tools/`

Contient l'affichage des tool calls et les rendus specialises.

Pas de sous-dossier `tool-block/` : sa nesting etait redondante une fois
deplacee sous `tools/` (« tools/tool-block » repetait le mot outil). Le
contenu vit a plat directement dans `tools/`, avec `renderers/` comme seul
sous-dossier justifie (22 fichiers, un par type d'outil).

### `panels/`

Contient les panneaux lateraux lies au chat : artefacts, documents, plans, demande utilisateur et subagents.

Les panels globaux de layout peuvent rester ailleurs, mais les panels qui dependent du chat doivent etre rapproches de ce domaine.

## Ordre de migration recommande

## Etat actuel de la refonte

### Phase 1 - Page de conversation

Statut : bien avancee.

Deja sorti de `Conversation.tsx` :

- affichage virtualise des messages vers `messages/MessageList.tsx` ;
- carte inline des plans vers `messages/PlanArtifactCard.tsx` ;
- activite live vers `messages/liveActivity.ts` ;
- attachments vers `attachments/attachmentTypes.ts` et `composer/useDraftAttachments.ts` ;
- composer vers `composer/ConversationComposer.tsx` ;
- modeles/providers vers `conversation/useConversationModels.ts` ;
- scroll vers `conversation/useConversationScroll.ts` ;
- actions topbar vers `conversation/useConversationActions.ts` ;
- panels et runtime actions de page vers `conversation/`.

### Phase 2 - Streaming

Statut : bien avancee.

Deja sorti de `useChat.ts` :

- transport HTTP/Electron vers `streaming/streamTransport.ts` ;
- types runtime vers `streaming/runtimeTypes.ts` ;
- polling de titre vers `streaming/titlePolling.ts` ;
- libelles d'erreur vers `streaming/streamErrors.ts` ;
- reducers de chunks principaux et sous-agents vers `streaming/streamReducers.ts` ;
- commit du payload final vers `streaming/streamCommit.ts` ;
- helpers de tool calls live vers `streaming/streamToolState.ts` ;
- reduction des runtime events principaux et sous-agents vers `streaming/runtimeEvents.ts` ;
- cycle d'envoi/transport/retry/watchdog vers `streaming/useChatStream.ts` ;
- presentation lissee des gros chunks texte/thinking vers `streaming/streamPresenter.ts`, inspiree de `desktop-v1` ;
- controleurs abort/stop vers `streaming/chatControllers.ts` ;
- wrapper de compatibilite conserve dans `hooks/useChat.ts`.

Reste a isoler prudemment :

- eventuellement scinder `runtimeEvents.ts` si les permissions/plans/subagents grossissent encore ;
- reduire les wrappers temporaires quand tous les imports auront migre vers le domaine `chat/streaming`.

### Phase 1 - Stabiliser la page

Objectif : alleger `Conversation.tsx` sans changer le comportement.

A faire :

- creer `conversation/` ;
- extraire le header, les helpers de modeles/providers et le scroll ;
- deplacer les helpers d'attachments vers `attachments/` ;
- garder les exports existants si des imports en dependent.

Validation :

- l'ecran de chat s'ouvre toujours ;
- les messages existants s'affichent ;
- l'envoi d'un message fonctionne ;
- `npm run typecheck` passe.

### Phase 2 - Isoler le streaming

Objectif : reduire `useChat.ts`.

A faire :

- creer `streaming/` ;
- extraire le transport stream ;
- extraire les reducers d'evenements runtime ;
- extraire la gestion du payload final ;
- conserver un wrapper `hooks/useChat.ts` temporaire si necessaire.

Validation :

- le streaming texte fonctionne ;
- les tool calls s'affichent ;
- le stop/retry fonctionne ;
- les permissions continuent d'apparaitre au bon moment ;
- `npm run typecheck` passe.

### Phase 3 - Clarifier l'etat

Objectif : sortir les types et reduire `stores/session.ts`.

Statut : en cours.

Deja sorti de `stores/session.ts` :

- types de session, streaming, agent, subagent et attachments vers `state/sessionTypes.ts` ;
- contrat du store Zustand vers `state/sessionStoreTypes.ts` ;
- conversion pure `streamingToContentBlocks` vers `state/streamingContent.ts` ;
- actions sessions/messages vers `state/sessionCollectionState.ts` ;
- actions streaming vers `state/streamingState.ts` ;
- actions agent vers `state/agentState.ts` ;
- actions plans vers `state/planState.ts` ;
- actions subagents vers `state/subagentState.ts` ;
- re-exports conserves dans `stores/session.ts` pour ne pas casser les imports existants.

A faire :

- eventuellement deplacer l'assemblage final vers `state/sessionStore.ts` plus tard ;
- reduire les wrappers temporaires quand les imports auront migre naturellement.

Validation :

- chargement des sessions OK ;
- creation/suppression/renommage de session OK ;
- streaming state OK ;
- plans et subagents OK ;
- `npm run typecheck` passe.

### Phase 4 - Ranger les panels

Objectif : rapprocher les panels du domaine chat.

Statut : en cours.

Deja deplace vers `panels/` :

- `AskUserPanel.tsx` ;
- `ArtifactPreviewPanel.tsx` ;
- `PDFViewerPanel.tsx` ;
- `DocxPreviewPanel.tsx` ;
- `XlsxPreviewPanel.tsx` ;
- `PptxPreviewPanel.tsx` ;
- `PlanEditorPanel.tsx` ;
- `SubagentPanel.tsx` ;
- `KnowledgePanel.tsx` ;
- `BrowserPanel.tsx` ;
- `AgentWorkspacePanel.tsx` ;
- `EmptyState.tsx`.

Nettoyage effectue :

- les wrappers morts des anciens chemins `components/chat/*Panel.tsx` ont ete supprimes ;
- les wrappers morts `components/chat/plan/PlanEditorPanel.tsx` et `components/chat/subagent/SubagentPanel.tsx` ont ete supprimes ;
- le wrapper mort `hooks/chatControllers.ts` a ete supprime ;
- le wrapper `hooks/useChat.ts` est conserve volontairement comme API stable tant que des imports actifs l'utilisent.

A faire :

- garder `layout/RightPanelHost.tsx` comme host de layout des colonnes et frames ;
- garder les composants purement layout dans `components/layout` ;
- verifier que l'ouverture/fermeture du panneau droit reste identique.

Validation :

- preview PDF/DOCX/PPTX/XLSX OK ;
- artifact preview OK ;
- plan editor OK ;
- ask-user panel OK ;
- subagent panel OK ;
- `npm run typecheck` passe.

### Phase 5 - Integrer les apports du legacy

Objectif : importer uniquement les bonnes idees du legacy desktop-v1.

Statut : demarree.

Deja repris depuis `legacy/seshat-desktop-v1` :

- pattern `StreamPresenter` adapte a la cible actuelle pour lisser les gros deltas texte/thinking sans retarder les tool calls ;
- reducer pur `reduceStreamChunk` pour garder un buffer streaming cible independant de la presentation affichee ;
- flush explicite aux frontieres sensibles (`runtime`, `done`, stop/error) pour preserver le comportement des permissions, plans et outils.

A faire :

- continuer la comparaison avec `legacy/seshat-desktop-v1/components/chat` ;
- ajouter les tests de streaming pertinents autour de `reduceStreamChunk` et `StreamPresenter` ;
- evaluer les vues live browser/terminal/editor/tasks sans les coller en bloc ;
- importer seulement ce qui ameliore la structure actuelle ;
- ne pas remplacer le chat actuel en bloc.

Validation :

- comportement actuel preserve ;
- meilleure separation des responsabilites ;
- aucune logique importante perdue.

### Phase 6 - Ranger tools/

Objectif : rassembler l'affichage des tool calls sous `tools/`, a plat, sans
nesting redondant.

Statut : faite (sauf `live/`, differe - voir plus bas).

Etape 1 - deplacement initial vers `tools/` :

- `ToolBlock.tsx` ;
- `PermissionCard.tsx` ;
- `QuietToolGroup.tsx` ;
- `AgentToolView.tsx` ;
- `thinkingMarkdownClass.ts` ;
- `tool-block/` deplace en bloc, inchange en interne.

Imports mis a jour dans `messages/MessageItem.tsx`, `panels/SubagentPanel.tsx`,
`panels/AskUserPanel.tsx`, `panels/AgentWorkspacePanel.tsx` et en interne dans
`tools/QuietToolGroup.tsx` (reference vers `messages/MessageItem` remontee d'un niveau).

Etape 2 - aplatissement de `tool-block/` (le nesting `tools/tool-block/` repetait
le mot outil sans rien clarifier une fois deplace sous `tools/`) :

- `types.ts`, `toolDisplay.tsx`, `quietGroupPhrase.ts`, `helpers.tsx`, `common.tsx`,
  `DiffView.tsx`, `ToolLineItem.tsx` remontes directement dans `tools/` ;
- `renderers/` (22 fichiers, un par type d'outil) garde comme seul sous-dossier,
  seule structure qui justifie une separation physique ;
- profondeur des imports relatifs internes inchangee (chaque fichier deplace au
  meme niveau que ses voisins, donc `./helpers`, `../common`, etc. restaient valides
  sans modification) ;
- dossier `tool-block/` vide supprime une fois le contenu remonte ;
- imports externes corriges dans `tools/ToolBlock.tsx`, `tools/PermissionCard.tsx`,
  `tools/QuietToolGroup.tsx`, `messages/MessageItem.tsx`, `panels/AskUserPanel.tsx`,
  `panels/AgentWorkspacePanel.tsx`.

Decision prise : `ChatTopBar.tsx` reste a la racine de `chat/`, hors de `tools/` et
de `conversation/` - voir Phase 8 (il est partage avec `pages/Home.tsx`).

`tools/live/` deliberement non cree maintenant : il n'y a aujourd'hui aucun code a y
deplacer. Le concept vient de `legacy/seshat-desktop-v1/src/renderer/components/chat/tools/live/`
(vues live browser/terminal/editor/tasks embarquees dans le fil de la conversation),
pas de quelque chose qui existe deja ici. Le "running" generique (spinner, statut) est
deja gere correctement en place, dans `ToolLineItem.tsx` et `AgentToolView.tsx` - ce
n'est pas ce que `live/` designerait. Creer le dossier vide maintenant aurait ete du
poids mort (meme erreur que le `subagent/` vide supprime en debut de session). A faire
seulement quand la Phase 5 tranchera quoi importer de `desktop-v1`.

Validation :

- tool calls et quiet groups s'affichent toujours dans la conversation et dans le
  panneau subagent ;
- `npm run typecheck` passe ;
- `npx vitest run` passe.

### Phase 7 - Terminer composer/

Objectif : finir de rassembler la zone de saisie sous `composer/`.

Statut : demarree.

Deja fait :

- `ChatInput.tsx` (33 Ko, le plus gros morceau restant du dossier `chat/` a plat)
  et `chatInputStyles.ts` deplaces vers `composer/` ;
- `ChatAttachment` et le type de props (renomme `ChatInputProps`) extraits vers
  `composer/composerTypes.ts`, conforme a l'arbre cible ;
- 4 importeurs mis a jour : `pages/Home.tsx`, `attachments/attachmentTypes.ts`,
  `composer/ConversationComposer.tsx`, `composer/useDraftAttachments.ts`.

Deliberement non fait a cette etape (pour ne pas migrer plusieurs responsabilites
critiques en meme temps) :

- le rendu interne de `ChatInput.tsx` n'a pas ete decoupe plus finement (textarea,
  dropdown slash, attachments, provider/model, micro restent dans un seul composant) ;
  l'arbre cible ne demande que 3 fichiers dans `composer/`, pas une decomposition
  supplementaire ;
- `SkillOption` et les helpers purs (`filePathToURL`, `formatAttachmentSize`,
  `isTextPreviewable`, `fetchTextPreview`) restent prives a `ChatInput.tsx`, non
  partages ailleurs.

A faire :

- `pages/Home.tsx` duplique une partie de la logique d'attachments deja dans
  `attachments/attachmentTypes.ts` (fonction `attachmentCategory` locale) - a
  reconcilier plus tard, hors scope de ce deplacement ;
- verifier a l'ecran : saisie, envoi, pieces jointes, dictee vocale, selection
  provider/model depuis la page d'accueil (`Home.tsx`) et depuis une conversation.

Validation :

- `npm run typecheck` passe ;
- `npx vitest run` passe ;
- aucun import restant vers `components/chat/ChatInput` ou `components/chat/chatInputStyles`.

### Phase 8 - Deplacer la page de conversation

Objectif : sortir `Conversation.tsx` de `pages/` vers `conversation/ConversationPage.tsx`,
dernier morceau de l'arbre cible qui manquait.

Statut : faite.

Deja fait :

- `pages/Conversation.tsx` deplace vers `conversation/ConversationPage.tsx` ; export
  renomme `Conversation` -> `ConversationPage` (coherent avec le nom de fichier et le
  reste du dossier) ;
- `router/index.tsx` mis a jour vers le nouvel emplacement ;
- `conversation/ConversationHeader.tsx` cree : wrapper fin autour de `ChatTopBar`
  (meme pattern que `composer/ConversationComposer.tsx` autour de `ChatInput.tsx`) ;
- `conversation/ConversationEmpty.tsx` cree : etat "Conversation not found" isole ;
- `ChatTopBar.tsx` **reste** a la racine de `chat/` (decision de la question ouverte
  en Phase 6) : il est partage avec `pages/Home.tsx` (page d'accueil / nouvelle
  conversation), donc il n'appartient pas au domaine `conversation/` seul.

Deliberement non fait :

- les imports absolus (`@renderer/components/chat/...`) internes a `ConversationPage.tsx`
  n'ont pas tous ete convertis en relatifs sauf ceux vers les modules qui sont
  maintenant des voisins directs (`../messages`, `../composer`, `./use...`) - les
  imports vers stores/hooks/lib restent en alias `@renderer/...`, sans changement de
  comportement ;
- pas de nouvelle extraction de `useConversationSession.ts` (l'arbre cible d'origine
  en proposait un ; dans les faits, cette responsabilite est deja couverte, de facon
  plus fine, par `useConversationSessionLoad.ts`, `useConversationActions.ts`,
  `useConversationModes.ts`, `useConversationPanels.ts` et
  `useConversationRuntimeActions.ts` - pas besoin d'un fichier de plus).

Note connue (non corrigee, pre-existante) : l'etat "Conversation not found" rendu par
`ConversationEmpty.tsx` s'affiche avant que `<style>{CONV_CSS}</style>` ne soit monte
(ce style vit dans le retour principal de `ConversationPage.tsx`, pas dans le retour
anticipe), donc la classe `.conv-empty` n'a jamais eu d'effet visuel meme avant ce
deplacement. Comportement inchange, juste documente.

Validation :

- `npm run typecheck` passe ;
- `npx vitest run` passe ;
- aucun import restant vers `pages/Conversation` ;
- a verifier a l'ecran : ouverture d'une conversation, session introuvable (URL avec
  un id invalide), export/partage/suppression depuis le menu du top bar.

### Phase 9 - Unifier l'affichage des pieces jointes

Objectif : l'utilisateur a signale que l'affichage des pieces jointes (image, PDF,
DOCX, XLSX, PPTX) portait la meme surcomplication que dans `seshat-ui` d'origine -
confirme par une comparaison avec `legacy/seshat-ui`, `legacy/seshat-desktop-v1` et
AI-Manus (`helps/ai-manus`). Diagnostic : la vignette d'une piece jointe etait codee
deux fois en parallele (`composer/ChatInput.tsx` avant envoi, `messages/MessageItem.tsx`
apres envoi), avec deux types quasi identiques (`ChatAttachment`/`MessageAttachment`),
deux copies de `fetchTextPreview`/`formatAttachmentSize`/`attachmentBorderClass`, et
deux effets de rehydratation independants. Decision utilisateur : simplifier comme
AI-Manus (2 cas au lieu de 3, pas de badge d'extension) plutot que juste dedupliquer
a comportement visuel identique.

Statut : faite.

Deja fait :

- **Type unifie** : `MessageAttachment` supprime, `ChatAttachment` (deplace dans
  `attachments/attachmentTypes.ts`, seule definition restante) utilise partout -
  `MessageAttachment` etait deja un sous-ensemble strict de `ChatAttachment`, donc
  aucun changement runtime ;
- **`attachments/attachmentPreview.ts`** (nouveau, prevu dans l'arbre cible d'origine) :
  logique pure de resolution d'URL de preview et de dispatch au clic
  (`resolveAttachmentOpenAction`), sans dependance a `useUIStore` - testable isolement ;
- **`attachments/AttachmentThumb.tsx`** (nouveau) : le seul endroit ou une vignette de
  piece jointe est rendue, reutilise par le composer (avec `onRemove`) et par un
  message envoye (lecture seule). Deux cas visuels seulement : une image reelle (photo,
  ou page 1 d'un PDF via `page_preview_urls`) s'affiche telle quelle ; tout le reste est
  icone + nom de fichier, sans badge d'extension, sans extrait de texte a 6px ;
  cliquer ouvre le bon panneau (PDF/DOCX/XLSX/PPTX natif, ou texte/markdown recupere
  a la demande, jamais de facon eager) ;
- **Fetch de texte devenu paresseux** : auparavant, chaque piece jointe md/txt/html/tex
  declenchait un fetch (et pour docx/pptx/xlsx, une conversion docling entiere) des
  l'affichage, juste pour nourrir la vignette. Desormais le fetch n'a lieu qu'au clic,
  et seulement pour les types qui n'ont pas de panneau natif dedie (docx/xlsx/pptx ne
  le declenchent plus jamais, puisqu'ils ouvrent directement leur panneau natif) ;
- **Extraction de vignette Office supprimee** : `lib/officeThumbnail.ts` (extraction
  JSZip d'une miniature `docProps/thumbnail.*` embarquee) est devenue du travail mort
  une fois la vignette reduite a 2 cas - supprimee de `useDraftAttachments.ts` et
  `Home.tsx`, puis le fichier lui-meme supprime (plus aucun appelant) ;
- **`ChatInput.tsx` simplifie** : la modale de preview interne (page_preview_urls /
  texte / image, ~90 lignes) est supprimee - un clic sur une piece jointe deja
  televersee ouvre desormais le meme panneau droit qu'un message envoye, via
  `AttachmentThumb` ;
- **`Home.tsx` dedoublonne** : `attachmentCategory`/`isPDFFile`/`sentAttachment`
  (copies exactes de `attachments/attachmentTypes.ts`) supprimees au profit des
  imports partages.

Chiffres : `ChatInput.tsx` 726 -> 475 lignes ; la logique de vignette, avant dupliquee
sur ~150-200 lignes a deux endroits, tient maintenant dans `AttachmentThumb.tsx` (128)
+ `attachmentPreview.ts` (85), une seule fois.

Deliberement non fait (hors scope de cette passe, note pour plus tard) :

- **`attachments/attachmentUpload.ts`** (prevu dans l'arbre cible d'origine) pas cree :
  `useDraftAttachments.ts` (Conversation) et `handleAttachFiles` de `Home.tsx` restent
  deux implementations paralleles de l'upload - la vraie difference entre elles est
  legitime (`Home.tsx` doit creer la session a la volee via `ensureSessionCreated`,
  `useDraftAttachments` suppose une session deja existante), mais le reste (previews
  PDF, appel `/sessions/:id/files`, gestion des etats uploading/failed) pourrait etre
  factorise. Pas fait ici pour rester sur le perimetre "affichage" demande ;
- `attachments/previews/` (prevu dans l'arbre cible d'origine) pas cree : les panneaux
  plein-ecran (`PDFViewerPanel`, `DocxPreviewPanel`, `XlsxPreviewPanel`,
  `PptxPreviewPanel`) restent dans `panels/`, coherent avec les autres panneaux
  document - pas deplaces pour cette passe.

Validation :

- `npm run typecheck` passe ;
- `npx vitest run` passe (55/55) ;
- aucun import restant vers `MessageAttachment` ni vers `lib/officeThumbnail` ;
- a verifier a l'ecran : vignette image (composer et message), vignette PDF/DOCX/
  fichier generique, clic pour ouvrir chaque type de panneau, piece jointe en cours
  d'upload, piece jointe en echec, suppression avant envoi.

### Ajout - Coller un texte long comme fichier

Demande utilisateur : coller un texte long dans le composer doit l'attacher comme un
`.txt`, plutot que de remplir la zone de saisie (comme Claude.ai/ChatGPT). Aucune
reference existante dans `legacy/seshat-ui`, `legacy/seshat-desktop-v1` ni AI-Manus -
fonctionnalite neuve.

Fait :

- `composer/pastedTextFilename.ts` (nouveau, teste) : seuil `PASTE_AS_FILE_THRESHOLD`
  (2000 caracteres) et `nextPastedTextFilename` (numerote "Pasted text.txt",
  "Pasted text 2.txt", ... si plusieurs collages dans le meme brouillon) ;
- `ChatInput.tsx` : `onPaste` sur le textarea - au-dela du seuil, cree un `File`
  texte et reutilise `onAttachFiles` (meme pipeline que le bouton trombone, donc
  meme upload, meme etat "uploading", meme vignette via `AttachmentThumb`) ;
  en dessous du seuil, comportement de collage inchange ;
- bonus meme geste : coller un fichier copie depuis l'explorateur (present dans
  `clipboardData.files`) s'attache aussi directement, au lieu de coller son chemin
  comme texte.

Validation :

- `npm run typecheck` passe ;
- `npx vitest run` passe (59/59, +4 tests sur `nextPastedTextFilename`) ;
- a verifier a l'ecran : coller un texte court (inchange), un texte long (devient
  piece jointe), coller un texte long deux fois de suite (deuxieme fichier numerote).

### Ajout - 3 bugs corriges dans le flux Plan

Audit demande par l'utilisateur (organisation generale + comportements live +
plan view). Rapport complet : navigateur live et liste de taches live deja solides ;
terminal live totalement absent (`BashToolView` = resultat final seulement, aucune
plomberie IPC de streaming, contrairement a `legacy/seshat-desktop-v1`) ; editeur live
post-hoc des deux cotes - ces 3 points restent a traiter plus tard, pas dans cette
passe. Le plan view avait 3 bugs de correction reels (pas du style), corriges ici :

1. **`panels/PlanEditorPanel.tsx` `handleDeny`** : les edits du textarea n'etaient
   jamais sauvegardes en cas de rejet/feedback (seul `handleProceed` les
   persistait), alors que le message envoye au modele affirmait quand meme
   "I've also updated the plan content directly." Corrige en sauvegardant le
   contenu edite en premier (meme logique que `handleProceed`), avec le meme
   comportement d'abandon si la sauvegarde echoue.
2. **`conversation/useConversationRuntimeActions.ts` `handlePlanProceed`** :
   contrairement a `PlanEditorPanel.handleProceed`, le chemin d'approbation de
   la carte inline (`PlanArtifactCard`) n'avait aucune garde `isSessionStreaming`
   avant de marquer le plan valide et d'envoyer le message - un plan pouvait
   etre marque "validated" pendant qu'un tour tournait deja, sans jamais notifier
   le modele. Restructure pour suivre exactement la meme logique que
   `PlanEditorPanel.handleProceed` (verification avant le PATCH, PATCH avant
   `sendMessage`, rien n'est avale silencieusement sur le chemin `submit_plan`).
3. **Meme fonction** : sur le chemin `submit_plan` (non bloquant), une erreur du
   PATCH `/plans/:id` etait avalee silencieusement puis `sendMessage` partait
   quand meme, disant au modele que le plan etait approuve alors que le statut
   serveur pouvait etre reste `pending`. Corrige : la fonction s'arrete et
   n'envoie rien si le PATCH echoue.

Nouveau parametre `onBlocked?: (message: string) => void` sur
`useConversationRuntimeActions`, branche depuis `ConversationPage.tsx` vers le
toast existant (`showToast(message, 'err')`) - la carte inline n'avait aucun
autre moyen de signaler un blocage a l'utilisateur.

Non corrige (mineur, hors scope) : pas de bouton "Refuser" sur la carte inline
(seulement "Proceed"), pas de reouverture automatique du panneau si un nouveau
plan arrive pendant qu'il est ferme, `editedContent` ecrase sans avertissement
si `plan.content` change pendant une edition en cours.

Validation :

- `npm run typecheck` passe ;
- `npx vitest run` passe (59/59) ;
- a verifier a l'ecran : editer un plan puis le rejeter (le contenu edite doit
  survivre), approuver un plan depuis la carte inline pendant qu'un tour tourne
  deja (doit afficher un toast d'erreur, pas de faux "validated").

## Regles de decision

Quand on hesite sur l'emplacement d'un fichier :

- si c'est visible a l'ecran de conversation : `conversation/` ou `messages/` ;
- si c'est lie a la saisie utilisateur : `composer/` ;
- si c'est lie aux fichiers : `attachments/` ;
- si c'est lie au flux temps reel : `streaming/` ;
- si c'est lie aux donnees partagees du chat : `state/` ;
- si c'est lie aux tool calls : `tools/` ;
- si c'est un panneau lateral du chat : `panels/`.

## Definition de "termine"

La restructuration est consideree terminee quand :

- `Conversation.tsx` est redevenu un composant d'orchestration lisible ;
- `useChat.ts` n'est plus le centre de toute la logique runtime ;
- `stores/session.ts` ne contient plus toutes les responsabilites du chat ;
- chaque dossier a une responsabilite claire ;
- les imports restent comprehensibles ;
- le comportement utilisateur est conserve ;
- `npm run typecheck` passe.
