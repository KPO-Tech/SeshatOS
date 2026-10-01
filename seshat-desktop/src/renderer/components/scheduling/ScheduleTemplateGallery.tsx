import { SCHEDULE_TEMPLATES, type ScheduleTemplate } from './scheduleTemplates'

// Grid of ready-to-use tasks. Picking one opens the regular form pre-filled;
// nothing is created until the user saves it.
export function ScheduleTemplateGallery({ onUse }: { onUse: (template: ScheduleTemplate) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
      {SCHEDULE_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onUse(template)}
          className="flex flex-col rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-3.5 text-left transition-colors hover:bg-[var(--surface-muted)]"
        >
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--accent-primary)]">{template.category}</span>
          <span className="mt-1 text-[13.5px] font-semibold text-[var(--text-primary)]">{template.name}</span>
          <span className="mt-1 line-clamp-3 text-[12px] leading-[17px] text-[var(--text-muted)]">{template.description}</span>
          <span className="mt-2.5 truncate text-[11px] text-[var(--text-secondary)]">
            {template.trigger_type === 'webhook' ? `Webhook (${template.webhook_method ?? 'POST'})` : `Cron ${template.cron_expr}`}
          </span>
        </button>
      ))}
    </div>
  )
}
