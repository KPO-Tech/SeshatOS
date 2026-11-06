import type { Gallery } from './types'

export const WORK: Gallery = {
  id: 'work',
  title: 'Decisions and reports',
  description: 'The documents of a working week: status, roadmap, comparisons, decisions, checklists and mail.',
  tone: 'slate',
  icon: 'document',
  examples: [
    {
      title: 'A status report',
      about: 'Figures, progress, a table and a risk.',
      code: `root = Stack([title, kpis, progress, table, risk])
title = Heading("Project Aurora, week 12", 2)
kpis = MetricRow([Metric("Done", "38 / 52", "+6", "up", "tasks"), Metric("Budget used", "61%", "+4%", "up"), Metric("Open risks", 2, "-1", "down")])
progress = ProgressBar(73, 100, "Overall progress", "blue")
table = Table([Col("Workstream"), Col("Owner"), Col("Status")], [["Backend", "Awa", Badge("on track", "success")], ["Mobile", "Koffi", Badge("late", "danger")], ["Docs", "Mia", Badge("done", "info")]])
risk = Callout("warning", "Mobile is two weeks late", "The store review changed its rules. Plan: ship the web app first, the store version after.")`
    },
    {
      title: 'A roadmap',
      about: 'What ships when.',
      code: `root = Timeline([t1, t2, t3, t4])
t1 = TimelineItem("Private beta", "March", "Twenty teams, weekly feedback.", "success")
t2 = TimelineItem("Public beta", "May", "Sign-up open, free plan only.", "info")
t3 = TimelineItem("Payments", "July", "Plans, invoices, taxes.", "warning")
t4 = TimelineItem("Launch", "September", "Press, partners, the new site.", "neutral")`
    },
    {
      title: 'Choosing a tool',
      about: 'A comparison, the pros and cons, a recommendation.',
      code: `root = Stack([table, pros, advice])
table = Table([Col("Option"), Col("Price", "number"), Col("Setup"), Col("Fit")], [["Notion", 10, "Minutes", Badge("good", "success")], ["Confluence", 6, "Hours", Badge("ok", "warning")], ["Plain Markdown", 0, "None", Badge("limited", "danger")]], "Three ways to keep team notes", false, true)
pros = ProsCons(["Notion: fast to start, great for non-technical people", "Notion: databases and templates"], ["Notion: export is weak", "Notion: offline mode is limited"], "Notion")
advice = Callout("success", "Recommendation", "Start with Notion for a quarter. Review the export need before the team passes ten people.")`
    },
    {
      title: 'A decision record',
      about: 'Why we chose, written down.',
      code: `root = Card([facts, context, decision, consequences], "ADR 12: use PostgreSQL for the main store")
facts = KeyValues([Pair("Status", "Accepted"), Pair("Date", "2026-11-06"), Pair("Decided by", "Platform team")])
context = Section("Context", [Markdown("We need transactions, joins and full-text search, and the team already knows SQL. A document store would force us to rebuild joins in code.")])
decision = Section("Decision", [Markdown("Use **PostgreSQL 16** as the main store, with managed backups, and add Redis only for caching.")])
consequences = Section("Consequences", [Markdown("- One database to operate, not two\\n- We give up easy horizontal sharding for now\\n- Revisit if writes pass 5k per second")])`
    },
    {
      title: 'A launch checklist',
      about: 'What must be true before going live.',
      code: `root = Card([progress, list], "Ready to launch?")
progress = ProgressBar(6, 9, "Items done", "green")
list = Checklist([CheckItem("Backups tested", true), CheckItem("Alerts routed to on call", true), CheckItem("Load test at 2x traffic", true), CheckItem("Privacy policy published", true), CheckItem("Rollback rehearsed", true), CheckItem("Status page ready", true), CheckItem("Support macros written", false), CheckItem("Press kit sent", false), CheckItem("Pricing page reviewed", false)])`
    },
    {
      title: 'An email draft',
      about: 'A subject, a recipient, a text to edit and copy.',
      code: `root = Draft("Hello Mr Ba,\\n\\nI am writing to confirm that I will leave the flat on 31 December, as agreed in the lease. I would like to book the inventory for Monday 29 December in the morning.\\n\\nPlease tell me which time suits you.\\n\\nBest regards,\\nAmina Diallo", "Notice of departure, flat 4B", "agency@example.com", "Your draft")`
    }
  ]
}
