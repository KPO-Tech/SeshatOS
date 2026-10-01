# Desktop Migration Plan

Date: 2026-09-22

Scope: refonte de `seshat-desktop/` par migration controlee depuis les sources
en lecture seule sous `D:\Documents\PROJECTS\ai\legacy\`.

Rappel de contrainte: ce document est un tableau de decision. Il ne valide
aucune migration de code par lui-meme.

## Sources

| Nom | Chemin | Role |
| --- | --- | --- |
| `seshat-ui` | `D:\Documents\PROJECTS\ai\legacy\seshat-ui` | Ancienne UI complete, source principale de logique produit et d'identite Seshat. |
| `desktop-v1` | `D:\Documents\PROJECTS\ai\legacy\seshat-desktop-v1` | Refonte precedente, source principale pour l'architecture Tailwind, les tests et les vues live. |
| `backup-desktop-main` | `D:\Documents\PROJECTS\ai\legacy\backup-desktop-main` | Reference supplementaire pour les vues natives/live si une piece manque dans `desktop-v1`. |
| cible | `D:\Documents\PROJECTS\ai\seshat-ai\seshat-desktop` | Nouveau client Electron/React/Tailwind dans le depot. |

## Synthese de decision

| Zone | Source retenue | Pourquoi | Fichiers source principaux | Conversions | A conserver depuis l'autre source | Manques / risques | Taille |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tokens et themes | Mix `desktop-v1` + `seshat-ui` | `desktop-v1` fournit les tokens semantiques (`--surface-*`, `--text-*`, `--accent-*`); `seshat-ui` fournit le dark chaud historique. | `legacy\seshat-desktop-v1\src\renderer\styles\tailwind.css`; `legacy\seshat-ui\src\renderer\styles\tokens.css`; cible `seshat-desktop\src\renderer\styles\tailwind.css`; `src\renderer\lib\theme.ts`; `ThemeToggleButton.tsx`. | Passer de 2 themes (`light`, `dark`) a 3 modes explicites. Ajouter `dark-seshat` ou nom equivalent. Adapter `ThemePreference`, `EffectiveTheme`, `applyTheme`, `ThemeToggleButton`. | Garder le light/dark neutre de `desktop-v1`; garder le dark chaud de `seshat-ui`. | Le toggle actuel ne gere que light/dark/auto. Le prompt demande trois modes, donc `auto` doit etre reconsidere ou deplace dans un select/menu. | Moyen |
| Shell general | `seshat-ui`, deja partiellement copie dans cible | Le prompt veut l'identite `seshat-ui`: logo, sidebar, `Ctrl K`, Recents, theme selector. La cible contient deja `Shell`, `Titlebar`, `Sidebar`, `SearchModal`, `RecentSessions`. | `legacy\seshat-ui\src\renderer\components\layout\Shell.tsx`; `Sidebar.tsx`; `Titlebar.tsx`; `SearchModal.tsx`; `RightPanelHost.tsx`; `ImageLightbox.tsx`; `stores\ui.ts`; `stores\session.ts`. | Alias `@/` vers `@renderer/`; supprimer dependance aux tokens `--color-*`; decomposer sidebar en fichiers cibles deja presents sous `layout/sidebar`. | Conserver de `desktop-v1` le repli auto sidebar et les patterns de stores testes si necessaire. | La cible a deja un shell avance, donc eviter de recopier aveuglement. Comparer avant remplacement. | Moyen |
| Chat | Base `seshat-ui` deja copiee, enrichie par `desktop-v1` | `seshat-ui`/cible a la logique runtime la plus complete; `desktop-v1` a la meilleure architecture modulaire, tests et vues live. Voir comparaison detaillee plus bas. | `legacy\seshat-ui\src\renderer\pages\Conversation.tsx`; `hooks\useChat.ts`; `components\chat\**`; `stores\session.ts`; `stores\ui.ts`; `legacy\seshat-desktop-v1\src\renderer\components\chat\**`; `stores\browser.ts`; `stores\terminal.ts`; `stores\tasks.ts`; `stores\agents.ts`; cible `seshat-desktop\src\renderer\pages\Conversation.tsx`; `hooks\useChat.ts`; `components\chat\**`. | Decouper `Conversation`, `useChat`, `ChatInput`, `MessageItem`, `RightPanelHost`, `stores/ui`; retirer progressivement `seshat-ui-compat.css`; convertir les derniers patterns monolithiques en `components/chat/lib`, `messages`, `attachments`, `tool-block`. | De `desktop-v1`: `useChatWorkspace`, `streamPresenter`, tests streaming, live browser/terminal/editor/tasks, stores dedies, attachments modulaires. | Gros risque de regression si on remplace le chat au lieu de le decouper. Le bon mouvement est extraction progressive depuis la cible actuelle. | Gros |
| Settings | `desktop-v1` / cible actuelle | La cible a deja des composants Settings propres et decoupes. | `seshat-desktop\src\renderer\components\settings\*.tsx`; reference `legacy\seshat-desktop-v1` si besoin. | Harmoniser tokens 3 themes; verifier qu'aucune couleur dure ne reste. | Depuis `seshat-ui`: logique d'organisation/admin si manquante. | LOCKED selon MVP, ne pas etendre hors besoins Chat. | Moyen |
| Config | `desktop-v1` / cible actuelle | La cible contient deja `config/*` riche: providers, models, knowledge, mcp, connectors, storage, multimodal. | `seshat-desktop\src\renderer\components\config\**`. | Harmoniser tokens; verifier API client et etats loading/error. | Depuis `seshat-ui`: organisation store/AuthGuard restant. | Ne pas modifier backend; noter les manques. | Moyen |
| Scheduling | `desktop-v1` / cible actuelle | Deja migre dans `components/scheduling`, avec utilitaires testes. | `seshat-desktop\src\renderer\components\scheduling\**`; tests `scheduleRecurrence.test.ts`, `scheduleFormState.test.ts`, `runFormatting.test.ts`. | Harmoniser shell/theme seulement. | Aucun a court terme. | Masque localement: exige serveur d'organisation connecte. Planificateur local backend a noter, pas a coder ici. | Petit |
| Skills | `desktop-v1` / cible actuelle | La cible contient `components/skills` et `ROADMAP.md`; tests sur logique pure. | `seshat-desktop\src\renderer\components\skills\**`. | Harmoniser tokens; suivre `components/skills/ROADMAP.md`. | Depuis `seshat-ui`: logique si un flux manque encore. | LOCKED apres Chat. | Moyen |
| Plugins | `desktop-v1` / cible actuelle | La cible contient `plugins`, catalogues, panels OAuth/API key/Knowledge/WhatsApp. | `seshat-desktop\src\renderer\components\plugins\**`; `shared\connector-catalog`. | Harmoniser tokens; garder catalogue partage. | Depuis `seshat-ui`: connecteurs anciens si comportement absent. | Attention symlink `node_modules/@seshat/connector-catalog`. Ne pas supprimer `node_modules`. | Moyen |
| Search | Cible actuelle, inspiree `desktop-v1` | `SearchModal` existe deja cote layout. | `seshat-desktop\src\renderer\components\layout\SearchModal.tsx`; `legacy\seshat-ui\components\layout\SearchModal.tsx`. | Verifier suppression en masse, recents, raccourcis. | De `desktop-v1`: ameliorations de recherche/historique mentionnees dans le prompt. | Peut dependre de sessions store. | Petit |
| Store / ex-Apps | `seshat-ui` conceptuellement, cible MVP limitee | Le prompt demande uniquement Knowledge pour le MVP. | `legacy\seshat-ui\src\renderer\pages\app-launcher\index.tsx`; `legacy\seshat-ui\src\renderer\apps\knowledge\**` si necessaire; cible `components/store/` si cree. | Renommer Apps -> Store. Ne pas porter Automation/Inbox/Team maintenant. | Depuis `desktop-v1`: design Tailwind si existant. | Dossier cible `components/store` absent actuellement. Decision necessaire: placeholder ou attendre Knowledge UI. | Moyen |
| Authentification | Deja fait depuis `desktop-v1` + ajouts `seshat-ui` | Le prompt marque Auth comme fait. La cible contient hooks de session validation/inactivity. | `seshat-desktop\src\renderer\components\auth\**`; `hooks\useSessionValidation.ts`; `hooks\useInactivityTimeout.ts`; `stores\auth.ts`; pages Login/Register. | Completer organisation store avec Config/Admin lorsque necessaire. | Depuis `seshat-ui`: `stores/organization` et morceaux AuthGuard organisation. | Ne pas rouvrir sauf bug bloquant. | Petit |
| Projects | A retravailler plus tard | Le prompt le marque gros morceau restant. | `legacy\seshat-ui\src\renderer\pages\projects\index.tsx`; cible a definir. | Retirer l'inutile, restructurer. | A determiner. | Hors priorite Chat. | Gros |

## Comparaison detaillee du Chat

### Etat cible actuel

La cible `seshat-desktop` contient deja une copie evoluee de la base
`seshat-ui`, mais pas identique fichier pour fichier:

- `Conversation.tsx` cible commence sur la meme structure que `seshat-ui`
  (`useSessionStore`, `useUIStore`, `useChat`, provider/model selectors), voir
  `seshat-desktop/src/renderer/pages/Conversation.tsx:4` et
  `legacy/seshat-ui/src/renderer/pages/Conversation.tsx:4`.
- Les hash SHA256 de `Conversation.tsx`, `useChat.ts`, `stores/session.ts` et
  `stores/ui.ts` different entre cible et `seshat-ui`: la cible n'est pas une
  copie brute, elle a deja des adaptations.
- Le hook cible `useChat.ts` contient deja watchdog, retry reseau, file IDs,
  `session_titled`, permission events, interrupt/stop et interpretation
  Knowledge/RAG. Points de preuve: `seshat-desktop/src/renderer/hooks/useChat.ts:136`,
  `:153`, `:177`, `:228`, `:366`, `:420`, `:724`, `:802`, `:1521`.

Conclusion: ne pas remplacer le chat cible par une source. Il faut le decouper.

### `seshat-ui` comme base fonctionnelle

Forces observees:

- Chat complet deja cable aux stores produit: `Conversation.tsx` importe
  `useSessionStore`, `useUIStore`, `useChat`, providers et PDF preview des le
  debut (`legacy/seshat-ui/src/renderer/pages/Conversation.tsx:4` a `:24`).
- Gestion attachments dans la conversation: detection fichiers documents,
  PDF, Office zip (`Conversation.tsx:26`, `:39`, `:52`, `:56`).
- Provider/model selection dans la page conversation (`Conversation.tsx:198` a
  `:288`).
- `useChat.ts` gere streaming, retries, watchdog, permissions runtime,
  titres de session, Knowledge/RAG (`legacy/seshat-ui/src/renderer/hooks/useChat.ts:136`,
  `:153`, `:177`, `:228`, `:366`, `:420`, `:724`, `:802`, `:1521`).
- Nombreux renderers de tools specialises: web search/fetch, browser, bash,
  edit, read/write, MCP, RAG, image/audio, plan, subagent.

Faiblesses:

- Beaucoup de logique concentree dans `Conversation.tsx` et `useChat.ts`.
- Style depend encore largement de la compatibilite `seshat-ui` et des anciens
  tokens.
- Moins de tests unitaires dans les pieces Chat que `desktop-v1`.

### `desktop-v1` comme source d'architecture et d'ameliorations

Forces observees:

- Chat decoupe en `lib`, `messages`, `attachments`, `tools`, `tools/live`,
  avec tests pour plusieurs utilitaires.
- `useChatWorkspace.ts` gere le flux de bout en bout de facon plus modulaire:
  session creation, upload fichiers, streaming, watchdog, retry, permissions,
  stop/interrupt (`legacy/seshat-desktop-v1/src/renderer/components/chat/lib/useChatWorkspace.ts:39`,
  `:168`, `:180`, `:209`, `:257`, `:311`, `:347`, `:420`).
- Protection contre double turn cote client: `isSessionStreaming(sessionId)`
  avant envoi (`useChatWorkspace.ts:167`).
- Vues live dediees: browser, terminal, editor, tasks sous
  `components/chat/tools/live`.
- Stores dedies pour `browser`, `terminal`, `tasks`, `agents`, `rightPanel`,
  avec tests sur certains stores.
- Attachments modulaires: `attachments/attachmentApi.ts`,
  `DraftAttachments.tsx`, previews PDF/DOCX/PPTX/XLSX/CSV.

Faiblesses:

- Pas la source d'identite produit definitive.
- Le flux doit etre recroise avec les endpoints actuels et la logique deja
  presente dans la cible.
- Risque d'introduire une deuxieme architecture si on colle `desktop-v1` en
  bloc au lieu d'en extraire les bonnes pieces.

### Recommandation Chat

Decision recommandee:

1. Garder la cible actuelle comme base runtime/fonctionnelle.
2. Decouper progressivement le code type `seshat-ui`:
   - `Conversation.tsx` -> composants de page + hooks de selection provider/model.
   - `useChat.ts` -> `chatApi.ts`, streaming parser, runtime event reducer,
     permission helpers, title/session helpers.
   - `ChatInput.tsx` -> input shell + attachments + controls.
   - `MessageItem.tsx` -> messages/content/actions/tool grouping.
   - `stores/ui.ts` -> right panel primitives + layout helpers.
3. Importer depuis `desktop-v1` uniquement les ameliorations prouvees:
   - live views browser/terminal/editor/tasks;
   - stores dedies si necessaires;
   - tests `streaming`, `streamPresenter`, attachments, tool bodies;
   - garde client contre double envoi par session.
4. Supprimer `styles/seshat-ui-compat.css` au fil des conversions, jamais d'un coup.

## Couche commune

| Couche | Decision recommandee | Raison |
| --- | --- | --- |
| Client API | Garder `seshat-desktop/src/renderer/api/client.ts` | C'est la cible active et elle doit rester compatible Electron/preload actuel. Importer seulement les endpoints manquants depuis `seshat-ui` ou `desktop-v1`. |
| Stores | Garder Zustand cible; extraire/rapatrier depuis `desktop-v1` les stores live dedies | La cible a deja `auth`, `session`, `ui`, `providers`, `overlay`, `dialogs`. `desktop-v1` apporte `browser`, `terminal`, `tasks`, `agents`, `rightPanel` avec tests. |
| Icones | Conserver `@icon-park/react` pour la compatibilite actuelle, puis rationaliser | La cible et `seshat-ui` utilisent deja beaucoup icon-park. Les SVG inline de `desktop-v1` ne doivent pas devenir une deuxieme convention globale. |
| CSS | Tokens semantiques + Tailwind en JSX | Ne plus ecrire de nouveau CSS de compatibilite. Garder `seshat-ui-compat.css` seulement pendant la decomposition. |

## Mapping initial des tokens de couleur

| Token `seshat-ui` | Token cible | Notes |
| --- | --- | --- |
| `--color-bg` | `--surface-root` | Fond application. |
| `--color-surface` | `--surface-panel` | Surfaces principales. |
| `--color-surface-elevated` | `--surface-muted` ou `--surface-menu` | Selon usage: carte vs menu flottant. |
| `--color-border` | `--border-soft` | Bordure standard. |
| `--color-border-strong` | `--border-strong` | Bordure accentuee. |
| `--color-text` | `--text-primary` | Texte principal. |
| `--color-text-secondary` | `--text-secondary` | Texte secondaire. |
| `--color-text-disabled` | `--text-muted` | Texte attenue. |
| `--color-primary` | `--accent-primary` | CTA orange Seshat. |
| `--color-primary-subtle` | `--accent-subtle` | Fond accent faible. |
| `--color-cta` | `--accent-primary` | Alias CTA. |
| `--color-accent` | `--accent-info` ou token dedie `--accent-warm` | Dans `seshat-ui`, `--color-accent` vaut chaud/beige. Ne pas l'ecraser sans decision. |

### Themes a produire

| Mode demande | Implementation proposee | Base |
| --- | --- | --- |
| Light desktop | `data-theme="light"` | `desktop-v1` light avec accent Seshat orange si valide. |
| Dark desktop | `data-theme="dark"` | `desktop-v1` dark neutre. |
| Dark Seshat UI | `data-theme="dark-seshat"` | `seshat-ui` dark chaud: `#2F2E34`, `#3A3941`, `#4A4852`, orange `#EF7C2F`. |

Point a trancher: garder `auto` comme quatrieme preference qui choisit entre
light/dark desktop, ou retirer `auto` du select visible pour respecter strictement
les trois modes demandes.

## Decisions a valider

1. Nom du troisieme theme: `dark-seshat`, `seshat-dark`, ou autre.
2. Comportement de `auto`: visible comme 4e option ou interne seulement.
3. Chat: valider la strategie "cible actuelle + extraction progressive +
   imports selectifs depuis `desktop-v1`".
4. Store / Apps: creer maintenant une surface vide limitee a Knowledge, ou
   attendre le tour MVP Knowledge UI.
5. Icones: confirmer `@icon-park/react` comme convention unique court terme.
6. Projects: confirmer que c'est hors priorite tant que Chat n'est pas termine.

## Verification a faire apres validation

Pour chaque zone migree:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Puis verification visuelle dans l'app, en redemarrant Electron si `src/main` ou
`src/preload` change.
