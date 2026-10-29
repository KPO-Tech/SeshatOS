// Worked examples given to the model. A test checks each one: it must parse with no error and use only components the model is taught.
export const PROMPT_EXAMPLES: string[] = [
  `root = Stack([title, kpis, table, note])
title = Heading("Terminal agents compared", 2)
kpis = MetricRow([m1, m2])
m1 = Metric("Tools compared", 5)
m2 = Metric("With a native sandbox", 3, "+1", "up")
table = Table([Col("Tool"), Col("Sandbox"), Col("Memory")], rows)
rows = [["Claude Code", Badge("yes", "success"), "CLAUDE.md"], ["Aider", Badge("no", "danger"), "chat history"]]
note = Callout("warning", "Not documented", "OpenCode does not document its internal database schema.")`,
  `root = Steps([s1, s2, s3])
s1 = Step("Install the runtime", "Run the installer, then restart the terminal.", "done")
s2 = Step("Add a provider key", "Open Settings, then Providers.", "doing")
s3 = Step("Send a first message")`,
  `root = Card([summary, plan], "Migration status", "info")
summary = MetricRow([Metric("Tables moved", 14, "+3", "up", "this week"), Metric("Left", 6)])
plan = Section("Next", [Steps([Step("Move the audit tables", null, "doing"), Step("Switch the reads", null, "todo")])])`
]
