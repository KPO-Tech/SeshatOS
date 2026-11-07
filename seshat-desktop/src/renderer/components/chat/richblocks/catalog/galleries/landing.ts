import type { Gallery } from './types'

export const LANDING: Gallery = {
  id: 'landing',
  title: 'Landing pages',
  description: 'Sketches of the home page of a site, by trade: a colour, a font and a mood for each.',
  tone: 'violet',
  icon: 'monitor',
  examples: [
    {
      title: 'An artisan bakery',
      about: 'Serif, warm browns, a testimonial.',
      code: `root = Browser([nav, hero, feats, quote, foot], "https://maison-aurore.fr", "#fffaf3", "serif", "lg")
nav = Nav("Maison Aurore", ["Breads", "Pastries", "Orders", "Contact"], "Order", "#b45309")
hero = Hero("Bread the way it used to be, kneaded every night", "Local flour, a 20-year-old sourdough, baked in a wood oven.", "See the menu", "Opening hours", "#92400e > #f59e0b", "left")
feats = Features([Feature("Natural sourdough", "A slow fermentation of 24 hours.", "bolt", "#b45309"), Feature("Local flour", "A mill 12 km from the shop.", "earth", "#65a30d"), Feature("Made every night", "Baking starts at 4 am, all warm by 7.", "clock", "#dc2626")], 3)
quote = Testimonial("We queue on Sundays, and we are right to.", "Camille R.", "A customer since 2016", "#b45309")
foot = Footer("Maison Aurore, 12 rue des Halles", ["Legal", "Instagram"])`
    },
    {
      title: 'A SaaS product',
      about: 'Gradient hero, logos, three prices.',
      code: `root = Browser([nav, hero, logos, feats, stats, plans, foot], "https://flowdesk.app", "#ffffff", "sans", "md")
nav = Nav("Flowdesk", ["Product", "Pricing", "Docs", "Changelog"], "Start free", "#6366f1")
hero = Hero("Every request, one calm inbox", "Flowdesk gathers email, chat and tickets, and tells your team what to answer first.", "Start free", "Book a demo", "#4f46e5 > #7c3aed > #db2777")
logos = Logos(["slack", "notion", "stripe", "figma", "github"], "Trusted by teams at")
feats = Features([Feature("One inbox", "Email, chat and tickets together.", "mail", "#6366f1"), Feature("Smart priority", "The urgent ones come first.", "ai", "#8b5cf6"), Feature("Made for teams", "Assign, comment, hand over.", "users", "#ec4899")], 3)
stats = Stats([Stat("4 h", "saved a week"), Stat("12k", "teams"), Stat("99.9%", "uptime")])
plans = Plans([Plan("Free", "0", ["1 user", "100 tickets"], "Start", "slate"), Plan("Team", "12 EUR", ["10 users", "Unlimited tickets", "Priority rules"], "Try it", "#6366f1", true), Plan("Company", "Talk to us", ["SSO", "Audit log", "Support"], "Contact", "slate")])
foot = Footer("2026 Flowdesk", ["Privacy", "Terms", "Status"])`
    },
    {
      title: 'A photographer portfolio',
      about: 'A dark page, a grid of pictures.',
      code: `root = Browser([nav, hero, grid, foot], "https://lena-photo.com", "#0b0b10", "display", "none")
nav = Nav("Lena Mbaye", ["Work", "Prints", "About"], "Hire me", "#f59e0b")
hero = Hero("Light, patiently", "Documentary and portrait photography, Dakar and Paris.", "See the work", null, "#1f2937 > #374151", "left")
grid = Grid([Picture("Harbour at dawn", "#0ea5e9 > #1e3a8a", 1.3), Picture("Market", "#f59e0b > #b45309", 1.3), Picture("Portrait, studio", "#a855f7 > #4c1d95", 1.3), Picture("Rain, Rue Cler", "#64748b > #0f172a", 1.3), Picture("Salt flats", "#fde68a > #f97316", 1.3), Picture("Night bus", "#14b8a6 > #0f172a", 1.3)], 3)
foot = Footer("Prints shipped worldwide", ["Instagram", "Contact"])`
    },
    {
      title: 'A restaurant',
      about: 'A menu as cards, a table booking button.',
      code: `root = Browser([nav, hero, feats, quote, foot], "https://chez-moussa.sn", "#fffdf8", "serif", "lg")
nav = Nav("Chez Moussa", ["Menu", "Wine", "Private dining"], "Book a table", "#be123c")
hero = Hero("Thieboudienne, like at home", "A family kitchen, fish from the morning boat, a terrace on the water.", "Book a table", "See the menu", "#9f1239 > #fb7185")
feats = Features([Feature("Starters", "Accra, pastels, fresh bissap.", "heart", "#be123c"), Feature("Mains", "Thieb, yassa, mafe.", "fire", "#ea580c"), Feature("Desserts", "Thiakry, mango, coconut.", "star", "#ca8a04")], 3)
quote = Testimonial("The best fish I have eaten in years.", "A. Fall", "Food critic", "#be123c")
foot = Footer("Tue to Sun, 12:00 to 23:00", ["Map", "Instagram"])`
    },
    {
      title: 'A conference',
      about: 'Figures, tickets and a bold look.',
      code: `root = Browser([nav, hero, stats, plans, foot], "https://devsummit.africa", "#0f172a", "display", "lg")
nav = Nav("DevSummit", ["Speakers", "Schedule", "Venue"], "Get a ticket", "#22c55e")
hero = Hero("Two days to build better software", "Talks, workshops and the best coffee in Abidjan. 14 to 15 March.", "Get a ticket", "See the schedule", "#0ea5e9 > #22c55e", "left")
stats = Stats([Stat("40", "speakers"), Stat("1,200", "attendees"), Stat("2", "days"), Stat("12", "workshops")])
plans = Plans([Plan("Student", "20 EUR", ["Both days", "Lunch"], "Register", "slate"), Plan("Standard", "90 EUR", ["Both days", "Lunch", "Workshops"], "Register", "#22c55e", true), Plan("Company", "400 EUR", ["5 tickets", "A stand"], "Register", "slate")])
foot = Footer("DevSummit Africa 2026", ["Code of conduct", "Contact"])`
    }
  ]
}
