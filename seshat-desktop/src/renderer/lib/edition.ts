// The public v1 edition: a local, single-user workspace. Everything below is
// finished or partly built code that is deliberately hidden from this release
// and will come back with Knowledge and SeshatCloud. Nothing here is removed -
// flip a flag to bring a feature back; the code stays compiled and typed.
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
}

const V1_EDITION: Edition = {
  accounts: false,
  cloud: false,
  knowledge: false,
  store: false
}

// What the next edition will switch on, for work in progress: run `npm run dev:next`. The public build never reads it.
const NEXT_EDITION: Edition = {
  ...V1_EDITION,
  store: true
}

export const edition: Edition = import.meta.env.VITE_SESHAT_EDITION === 'next' ? NEXT_EDITION : V1_EDITION
