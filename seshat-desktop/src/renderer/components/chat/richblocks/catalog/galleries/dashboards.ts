import type { Gallery } from './types'

export const DASHBOARDS: Gallery = {
  id: 'dashboards',
  title: 'Dashboards',
  description: 'Side bar, key figures, curves and tables: the look of a product, for every kind of work.',
  tone: 'blue',
  icon: 'dashboard',
  examples: [
    {
      title: 'Sales',
      about: 'Revenue, orders, a monthly curve and the best products.',
      code: `root = Browser([app], "https://shop.admin/sales", "#ffffff", "sans", "md")
app = Shell([SideItem("Overview", "dashboard"), SideItem("Orders", "folder"), SideItem("Customers", "users"), SideItem("Settings", "setting")], [row, trend, best], "Shopfront", "#10b981")
row = Grid([Kpi("Revenue", "48.2k EUR", "+8.4%", "green"), Kpi("Orders", "1,284", "+3.1%", "blue"), Kpi("Returns", "2.1%", "-0.4%", "orange")], 3)
trend = Tile([Spark([30, 34, 31, 39, 42, 40, 48], "#10b981")], "Revenue, last 7 months (k EUR)")
best = Tile([DataRows(["Product", "Sold", "Revenue"], [["Linen shirt", "312", "9,360"], ["Canvas bag", "280", "5,600"], ["Wool scarf", "190", "7,600"]])], "Best sellers")`
    },
    {
      title: 'Monitoring',
      about: 'Latency, errors and the state of each service.',
      code: `root = Browser([app], "https://status.internal", "#0f172a", "mono", "sm")
app = Shell([SideItem("Services", "server"), SideItem("Alerts", "bell"), SideItem("Logs", "log"), SideItem("On call", "users")], [row, trend, table], "Pulse", "#38bdf8")
row = Grid([Kpi("p95 latency", "182 ms", "-12 ms", "green"), Kpi("Error rate", "0.31%", "+0.05%", "red"), Kpi("Requests", "3.4k/s", "+9%", "blue")], 3)
trend = Tile([Spark([210, 190, 220, 200, 185, 192, 182], "#38bdf8"), Spark([1, 2, 1, 4, 2, 3, 3], "#f43f5e", "bars")], "Latency and errors")
table = Tile([DataRows(["Service", "State", "Version"], [["api", "healthy", "1.14.2"], ["worker", "healthy", "1.14.2"], ["search", "degraded", "1.13.9"]])], "Services")`
    },
    {
      title: 'Project management',
      about: 'Progress, velocity and a table of projects.',
      code: `root = Browser([app], "https://work.example/projects", "#ffffff", "sans", "lg")
app = Shell([SideItem("Overview", "dashboard"), SideItem("Projects", "folder"), SideItem("Team", "users"), SideItem("Reports", "chart")], [row, velocity, table], "Workbench", "#6366f1")
row = Grid([Kpi("Active projects", "24", "+3", "blue"), Kpi("On track", "81%", "+5%", "green"), Kpi("Late", "4", "-1", "red")], 3)
velocity = Tile([Spark([8, 10, 9, 12, 11, 14, 15, 13], "#6366f1", "bars")], "Tasks done per week")
table = Tile([DataRows(["Project", "Owner", "Status"], [["Website", "Awa", "On track"], ["Mobile app", "Koffi", "Late"], ["Docs", "Mia", "Done"], ["Billing", "Sam", "On track"]])], "Projects")`
    },
    {
      title: 'Personal finance',
      about: 'Where the month went.',
      code: `root = Browser([app], "https://budget.example", "#fbfaf7", "sans", "lg")
app = Shell([SideItem("Month", "dashboard"), SideItem("Budgets", "wallet"), SideItem("Goals", "flag"), SideItem("Accounts", "folder")], [row, spend, table], "Penny", "#16a34a")
row = Grid([Kpi("Income", "3,200", "+0%", "green"), Kpi("Spent", "2,140", "-6%", "orange"), Kpi("Saved", "1,060", "+18%", "blue")], 3)
spend = Tile([Spark([320, 410, 280, 520, 390, 450, 330], "#f97316", "bars")], "Spent each week")
table = Tile([DataRows(["Category", "Budget", "Spent"], [["Housing", "900", "900"], ["Food", "450", "412"], ["Transport", "150", "96"], ["Leisure", "200", "230"]])], "By category")`
    },
    {
      title: 'Web analytics',
      about: 'Visitors, sources and top pages.',
      code: `root = Browser([app], "https://analytics.example/site", "#ffffff", "sans", "md")
app = Shell([SideItem("Realtime", "dashboard"), SideItem("Pages", "files"), SideItem("Sources", "link"), SideItem("Goals", "flag")], [row, traffic, pages], "Tally", "#f97316")
row = Grid([Kpi("Visitors", "12.4k", "+14%", "orange"), Kpi("Bounce rate", "41%", "-3%", "green"), Kpi("Avg. time", "2m 18s", "+9s", "blue")], 3)
traffic = Tile([Spark([900, 1100, 1000, 1400, 1300, 1700, 1650, 1900], "#f97316")], "Visitors per day")
pages = Tile([DataRows(["Page", "Views", "Time"], [["/", "5,210", "1m 02s"], ["/pricing", "2,980", "2m 40s"], ["/blog/launch", "1,730", "3m 15s"]])], "Top pages")`
    }
  ]
}
