import { ScheduleTemplateGallery } from './ScheduleTemplateGallery'
import type { ScheduleTemplate } from './scheduleTemplates'

// Its own tab, separate from Tasks - these are ready-to-use starting points,
// not scheduled work, so mixing them into the Tasks list (as an inline
// gallery shown only when there were no tasks yet) made the two easy to
// confuse.
export function ScheduleTemplatesTab({ onUse }: { onUse: (template: ScheduleTemplate) => void }) {
  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-8">
      <p className="mb-4 text-[13px] font-semibold text-[var(--text-muted)]">Pick a template to pre-fill a new schedule. Nothing is created until you save it.</p>
      <ScheduleTemplateGallery onUse={onUse} />
    </div>
  )
}
