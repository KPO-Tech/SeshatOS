import {
  siAirtable,
  siAsana,
  siConfluence,
  siDiscord,
  siGithub,
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siGooglesheets,
  siHubspot,
  siIntercom,
  siJira,
  siLinear,
  siMailgun,
  siNotion,
  siStripe,
  siTelegram,
  siTrello,
  siWhatsapp,
  siZendesk,
  type SimpleIcon
} from 'simple-icons'

// Explicit imports (not `import *`) so the bundler only ships these marks.
// Vendors simple-icons has no mark for (Microsoft's product sub-brands, Slack,
// Salesforce, ...) are absent on purpose: BrandIcon draws a monogram for them
// rather than an invented logo.
export const BRAND_ICONS: Record<string, SimpleIcon> = {
  airtable: siAirtable,
  asana: siAsana,
  confluence: siConfluence,
  discord: siDiscord,
  gcalendar: siGooglecalendar,
  gdrive: siGoogledrive,
  github: siGithub,
  gmail: siGmail,
  gsheets: siGooglesheets,
  hubspot: siHubspot,
  intercom: siIntercom,
  jira: siJira,
  linear: siLinear,
  mailgun: siMailgun,
  notion: siNotion,
  stripe: siStripe,
  telegram: siTelegram,
  trello: siTrello,
  whatsapp: siWhatsapp,
  zendesk: siZendesk
}
