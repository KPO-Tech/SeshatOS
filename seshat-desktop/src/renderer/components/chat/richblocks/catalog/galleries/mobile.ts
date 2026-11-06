import type { Gallery } from './types'

export const MOBILE: Gallery = {
  id: 'mobile',
  title: 'Mobile apps',
  description: 'Screens of an app in a phone: figures, curves, lists and one clear button.',
  tone: 'blue',
  icon: 'phone',
  examples: [
    {
      title: 'A fitness tracker',
      about: 'Today at a glance: steps, heart, a weekly curve.',
      code: `root = Phone([head, row, week, go], "#0b1220", "display", "lg")
head = Nav("Today", [], "Run", "#22c55e")
row = Grid([Kpi("Steps", "8,420", "+12%", "green"), Kpi("Heart", "64 bpm", "-2", "red")], 2)
week = Tile([Spark([4, 6, 5, 8, 7, 9, 6], "#22c55e", "bars")], "This week")
go = Cta("Start a run", "#22c55e")`
    },
    {
      title: 'A recipe book',
      about: 'A picture, a title, the steps.',
      code: `root = Phone([pic, title, stats, steps], "#fffaf3", "serif", "lg")
pic = Picture("Tomato soup", "#ef4444 > #f97316", 1.5)
title = Nav("Roasted tomato soup", [], null, "#dc2626")
stats = Stats([Stat("25 min", "prep"), Stat("4", "people"), Stat("Easy", "level")])
steps = Tile([DataRows(["Step", "What to do"], [["1", "Roast tomatoes, 200 C"], ["2", "Blend with stock"], ["3", "Season, serve hot"]])], "Method")`
    },
    {
      title: 'A banking app',
      about: 'Balance, a curve and the last movements.',
      code: `root = Phone([head, balance, curve, list], "#ffffff", "sans", "lg")
head = Nav("Mon compte", [], null, "#0ea5e9")
balance = Kpi("Balance", "2,480.50 EUR", "+120 this week", "blue")
curve = Tile([Spark([1900, 2100, 2000, 2250, 2200, 2400, 2480], "#0ea5e9")], "30 days")
list = Tile([DataRows(["When", "Who", "Amount"], [["Today", "Coffee", "-3.20"], ["Yesterday", "Salary", "+1,800"], ["Mon", "Rent", "-650"]])], "Latest")`
    },
    {
      title: 'A music player',
      about: 'A cover, a title, big buttons.',
      code: `root = Phone([cover, title, bar, buttons], "#111827", "display", "lg")
cover = Picture("Night drive", "#7c3aed > #ec4899 > #f59e0b", 1)
title = Nav("Night drive", ["Aya Nakamura"], null, "#ec4899")
bar = Spark([2, 3, 5, 4, 6, 8, 7, 9, 6, 5, 7, 8], "#ec4899", "bars")
buttons = Grid([Cta("Previous", "#ec4899", "outline"), Cta("Play", "#ec4899"), Cta("Next", "#ec4899", "outline")], 3)`
    },
    {
      title: 'A to-do list',
      about: 'A short list and a progress bar.',
      code: `root = Phone([head, progress, tasks, add], "#ffffff", "sans", "md")
head = Nav("Today", ["Fri 6"], null, "#6366f1")
progress = Tile([Stats([Stat("3/5", "done")]), Spark([1, 2, 2, 3, 3, 4, 5], "#6366f1")], "Progress")
tasks = Tile([DataRows(["Task", "When"], [["Send the invoice", "9:00"], ["Call the school", "11:30"], ["Groceries", "18:00"]])], "Next")
add = Cta("Add a task", "#6366f1")`
    }
  ]
}
