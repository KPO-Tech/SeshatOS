import type { ReactNode } from 'react'
import { Info, Pic, FileText, Page, Table } from '@icon-park/react'

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] p-4">
      <h3 className="m-0 mb-2.5 flex items-center gap-2 text-[14px] font-semibold text-[var(--text-primary)]">
        <span className="flex text-[var(--accent-primary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

// What the readers handle, from the extensions they are written for (see the readers of the runtime).
const FORMATS: Array<{ icon: ReactNode; title: string; detail: string }> = [
  { icon: <Page theme="outline" size={18} />, title: 'PDF', detail: 'Text, images, scanned pages (OCR)' },
  { icon: <FileText theme="outline" size={18} />, title: 'Office', detail: 'DOCX, XLSX, PPTX' },
  { icon: <Table theme="outline" size={18} />, title: 'Text and data', detail: 'TXT, MD, CSV, JSON, XML, HTML' },
  { icon: <Pic theme="outline" size={18} />, title: 'Images', detail: 'PNG, JPG, WebP' }
]

export function DocumentsAside() {
  return (
    <aside className="flex w-full flex-col gap-3 xl:w-[290px] xl:shrink-0">
      <Card icon={<Info theme="outline" size={16} />} title="How it works">
        <p className="m-0 text-[12.5px] leading-[19px] text-[var(--text-secondary)]">
          SeshatOS reads a document with the readers built into the app, or with a document server you give it. The text is extracted, cut into passages and indexed, so that your agents can search it, analyze it and quote it.
        </p>
      </Card>
      <Card icon={<FileText theme="outline" size={16} />} title="Supported formats">
        <ul className="m-0 grid list-none gap-3 p-0">
          {FORMATS.map((format) => (
            <li key={format.title} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-secondary)]">{format.icon}</span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-[var(--text-primary)]">{format.title}</span>
                <span className="block text-[11.5px] text-[var(--text-muted)]">{format.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  )
}
