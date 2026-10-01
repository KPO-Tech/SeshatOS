import type { PluginSource } from './catalog/pluginCatalog'

// Heading and one-line explanation shown above each way of connecting a plugin.
export function sourceCopy(source: PluginSource): { heading: string; hint: string } {
  switch (source.type) {
    case 'cloud-oauth':
      return {
        heading: 'Organization account',
        hint: 'Your own account, used by agents and automations that run on Seshat Server. An admin must have registered the app first.'
      }
    case 'cloud-key':
      return { heading: 'Organization account', hint: 'Connect with an API key. It is stored on Seshat Server and used by agents and automations.' }
    case 'inbox-oauth':
      return { heading: 'Inbox on this device', hint: 'Lets the inbox agent read, sync and reply. Runs on this computer only.' }
    case 'whatsapp':
      return { heading: 'Linked device', hint: 'WhatsApp is linked from your phone and runs on this computer only.' }
    case 'knowledge':
      return { heading: 'Knowledge source', hint: 'Documents are synced into a knowledge base that agents can search.' }
  }
}
