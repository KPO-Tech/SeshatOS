// What the app shows. There is one version of it, with everything on: the code on the main branch, `make dev` and a build you make
// yourself all show the same app.
//
// A release can still hide what is not ready: the release workflow builds with VITE_SESHAT_EDITION=public, which switches every flag
// below off (the local, single-user workspace of the first public version). That one line of .github/workflows/release-desktop.yml is
// the decision of what a release shows; nothing here is removed, a flag only hides code that stays compiled and typed.
// `npm run dev:public` runs the app as a release would show it.
export type Edition = {
  // Welcome screen with log in / create account / enterprise contact. Off: the
  // app opens the local session by itself and never mentions an account.
  accounts: boolean
  // Pairing with a SeshatCloud (config section, admin page, organization
  // connectors, organization-managed catalogs and policies).
  cloud: boolean
  // Knowledge bases: config section, composer selector and panel.
  knowledge: boolean
  // The community store page.
  store: boolean
  // The Knowledge platform page, opened from the Store and the sidebar.
  knowledgeApp: boolean
  // The sources of an answer, folded at its end (the web pages behind a chat answer).
  sources: boolean
}

export const FULL_EDITION: Edition = {
  accounts: true,
  cloud: true,
  knowledge: true,
  store: true,
  knowledgeApp: true,
  sources: true
}

export const PUBLIC_EDITION: Edition = {
  accounts: false,
  cloud: false,
  knowledge: false,
  store: false,
  knowledgeApp: false,
  sources: false
}

/** The edition a build was made for: the public one when asked for by name, the full one otherwise. */
export function editionFor(name: string | undefined): Edition {
  return name === 'public' ? PUBLIC_EDITION : FULL_EDITION
}

export const edition: Edition = editionFor(import.meta.env.VITE_SESHAT_EDITION)
