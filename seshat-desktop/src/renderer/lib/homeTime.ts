const two = (value: number) => String(value).padStart(2, '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** When something happened, for a list of recent things: "Today, 14:32", "Yesterday, 18:04", or "Oct 28, 09:12" (with the year when it is not this one). */
export function homeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const clock = `${two(at.getHours())}:${two(at.getMinutes())}`
  const today = startOfDay(new Date(now))
  const day = startOfDay(at)
  if (day === today) return `Today, ${clock}`
  if (day === startOfDay(new Date(today - 1))) return `Yesterday, ${clock}`
  const year = at.getFullYear() === new Date(now).getFullYear() ? '' : ` ${at.getFullYear()}`
  return `${MONTHS[at.getMonth()]} ${at.getDate()}${year}, ${clock}`
}
