import type { Gallery } from './types'

export const SCHEMAS: Gallery = {
  id: 'schemas',
  title: 'Schemas and strategy',
  description: 'The shapes of a strategy or a method: a honeycomb, a process, a cycle, a pyramid, a funnel, a matrix and a stack.',
  tone: 'orange',
  icon: 'layers',
  examples: [
    {
      title: 'The role of architecture',
      about: 'A honeycomb in two groups, one hexagon stressed.',
      code: `root = Hive([[vision], [outcomes, value], [capabilities], [ecosystem, architecture], [delivery]], "The role of architecture within the strategy and the operating model", "Data and analytics strategy", "Operating model")
vision = Hex("Data-driven vision", "#172554")
outcomes = Hex("Stakeholder outcomes", "#172554")
value = Hex("Value propositions", "#172554")
capabilities = Hex("Capabilities and deficits", "#172554")
ecosystem = Hex("Ecosystem", "#172554")
architecture = Hex("Architectures", "#f97316")
delivery = Hex("Delivery model", "#172554")`
    },
    {
      title: 'A product strategy',
      about: 'Seven hexagons, seven colours.',
      code: `root = Hive([[a, b], [c, d, e], [f, g]], "Product strategy")
a = Hex("Customers", "#2563eb")
b = Hex("Problem", "#0ea5e9")
c = Hex("Positioning", "#14b8a6")
d = Hex("Product", "#8b5cf6")
e = Hex("Pricing", "#db2777")
f = Hex("Go to market", "#f97316")
g = Hex("Metrics", "#65a30d")`
    },
    {
      title: 'Design thinking',
      about: 'A method in five arrow-shaped steps.',
      code: `root = Chevrons([c1, c2, c3, c4, c5], "The five steps of design thinking")
c1 = Chev("Empathise", "Talk to the people who live the problem.", "#2563eb")
c2 = Chev("Define", "State the problem in one sentence.", "#0ea5e9")
c3 = Chev("Ideate", "Sketch many answers, judge none.", "#14b8a6")
c4 = Chev("Prototype", "Make the cheapest version that can be tried.", "#f59e0b")
c5 = Chev("Test", "Watch someone use it, then change it.", "#f97316")`
    },
    {
      title: 'A continuous loop',
      about: 'Plan, do, check, act.',
      code: `root = Cycle([p, d, c, a], "PDCA", "Continuous improvement")
p = Loop("Plan", "#2563eb")
d = Loop("Do", "#14b8a6")
c = Loop("Check", "#f59e0b")
a = Loop("Act", "#db2777")`
    },
    {
      title: 'A hierarchy of needs',
      about: 'A pyramid in five levels.',
      code: `root = Pyramid([l1, l2, l3, l4, l5], "Maslow, in five levels")
l1 = Level("Self-fulfilment", "Becoming who you can be", "#7c3aed")
l2 = Level("Esteem", "Respect, recognition", "#2563eb")
l3 = Level("Belonging", "Friends, family, love", "#0ea5e9")
l4 = Level("Safety", "Health, work, home", "#14b8a6")
l5 = Level("Physiological", "Food, water, sleep", "#65a30d")`
    },
    {
      title: 'A sales funnel',
      about: 'From visitors to customers.',
      code: `root = Pyramid([v, l, t, c], "From a visit to a customer", true)
v = Level("Visitors", "12,000", "#2563eb")
l = Level("Leads", "1,800", "#0ea5e9")
t = Level("Trials", "420", "#14b8a6")
c = Level("Customers", "96", "#f97316")`
    },
    {
      title: 'The five forces of Porter',
      about: 'A centre pressed on by four forces.',
      code: `root = Hub(core, [entrants, suppliers, buyers, substitutes], "The five forces of Porter", "in")
core = Spoke("Rivalry among competitors", "How hard firms fight for the same customers.", "#1e3a8a")
entrants = Spoke("New entrants", "Barriers to entry.", "#f97316")
suppliers = Spoke("Supplier power", "Few suppliers, high prices.", "#8b5cf6")
buyers = Spoke("Buyer power", "Customers who can bargain.", "#14b8a6")
substitutes = Spoke("Substitutes", "Another way to do the same job.", "#db2777")`
    },
    {
      title: 'Who is around a project',
      about: 'Six stakeholders, arrows out from the project.',
      code: `root = Hub(core, [a, b, c, d, e, f], "Stakeholders", "out")
core = Spoke("New app", "Launch in March.", "#2563eb")
a = Spoke("Customers", "Use it daily.", "#14b8a6")
b = Spoke("Support", "Answers questions.", "#f97316")
c = Spoke("Sales", "Sells the plans.", "#8b5cf6")
d = Spoke("Legal", "Reviews the terms.", "#64748b")
e = Spoke("Finance", "Tracks the budget.", "#65a30d")
f = Spoke("Partners", "Integrate the API.", "#db2777")`
    },
    {
      title: 'Effort and impact',
      about: 'What to do first.',
      code: `root = Quadrant([q1, q2, q3, q4], "Effort", "Impact", "Where to start")
q1 = Quad("Quick wins", "Do these now.", "#16a34a")
q2 = Quad("Big bets", "Plan them, then commit.", "#2563eb")
q3 = Quad("Fill-ins", "Only if there is spare time.", "#64748b")
q4 = Quad("Money pits", "Say no.", "#dc2626")`
    },
    {
      title: 'What a product person does',
      about: 'Three overlapping skills.',
      code: `root = Venn([a, b, c], "Product", "What a product person does")
a = VSet("Business", "Value, price, growth", "#2563eb")
b = VSet("Design", "Needs, flows, craft", "#db2777")
c = VSet("Technology", "What is possible", "#16a34a")`
    },
    {
      title: 'Two sets',
      about: 'What two teams share.',
      code: `root = Venn([a, b], "Shared", "Where design and engineering meet")
a = VSet("Design", "Look and feel", "#8b5cf6")
b = VSet("Engineering", "Build and run", "#0ea5e9")`
    },
    {
      title: 'An org chart',
      about: 'A company in three levels.',
      code: `root = Tree(ceo, "Acme, who does what")
ceo = Branch("CEO", [cto, cfo, cmo], "Amina Diallo", "#1e3a8a")
cto = Branch("CTO", [eng, ops], "Koffi Mensah", "#2563eb")
cfo = Branch("CFO", [fin], "Sam Okoro", "#0ea5e9")
cmo = Branch("CMO", [], "Mia Traore", "#14b8a6")
eng = Branch("Engineering", [], "24 people", "#64748b")
ops = Branch("Platform", [], "9 people", "#64748b")
fin = Branch("Finance", [], "6 people", "#64748b")`
    },
    {
      title: 'A decision tree',
      about: 'Should we build it ourselves?',
      code: `root = Tree(q1, "Build or buy?")
q1 = Branch("Is it our core?", [yes, no], null, "#1e3a8a")
yes = Branch("Yes: build", [team], "It sets us apart", "#16a34a")
no = Branch("No: can we buy it?", [buy, rent], null, "#2563eb")
team = Branch("Staff a team", [], "Two engineers", "#64748b")
buy = Branch("Yes: buy", [], "A vendor", "#f97316")
rent = Branch("No: wait", [], "Revisit in a year", "#64748b")`
    },
    {
      title: 'A web application stack',
      about: 'Five layers, from the screen to the machine.',
      code: `root = Layers([l1, l2, l3, l4, l5], "From the screen to the machine")
l1 = Layer("Interface", "React, a design system, the pages", "#db2777")
l2 = Layer("API", "REST and events, authentication", "#8b5cf6")
l3 = Layer("Services", "Billing, search, notifications", "#2563eb")
l4 = Layer("Data", "PostgreSQL, Redis, object storage", "#0ea5e9")
l5 = Layer("Infrastructure", "Kubernetes, networks, backups", "#14b8a6")`
    }
  ]
}
