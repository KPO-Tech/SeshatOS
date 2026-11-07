import type { TFunction } from 'i18next'
import type { VisualId } from '@renderer/lib/whatsNew'

// The title and the text of each card of the release notes. Each key is written out: the check of the translations cannot read a key
// built from pieces.
export function highlightText(t: TFunction, id: VisualId): { title: string; text: string } {
  switch (id) {
    case 'look':
      return { title: t('shell:whatsnew.highlights.look.title'), text: t('shell:whatsnew.highlights.look.text') }
    case 'tasks':
      return { title: t('shell:whatsnew.highlights.tasks.title'), text: t('shell:whatsnew.highlights.tasks.text') }
    case 'bell':
      return { title: t('shell:whatsnew.highlights.bell.title'), text: t('shell:whatsnew.highlights.bell.text') }
    case 'home':
      return { title: t('shell:whatsnew.highlights.home.title'), text: t('shell:whatsnew.highlights.home.text') }
    case 'settings':
      return { title: t('shell:whatsnew.highlights.settings.title'), text: t('shell:whatsnew.highlights.settings.text') }
    case 'projects':
      return { title: t('shell:whatsnew.highlights.projects.title'), text: t('shell:whatsnew.highlights.projects.text') }
    case 'genui':
      return { title: t('shell:whatsnew.highlights.genui.title'), text: t('shell:whatsnew.highlights.genui.text') }
    case 'pages':
      return { title: t('shell:whatsnew.highlights.pages.title'), text: t('shell:whatsnew.highlights.pages.text') }
    case 'language':
      return { title: t('shell:whatsnew.highlights.language.title'), text: t('shell:whatsnew.highlights.language.text') }
    case 'skills':
      return { title: t('shell:whatsnew.highlights.skills.title'), text: t('shell:whatsnew.highlights.skills.text') }
    case 'changes':
      return { title: t('shell:whatsnew.highlights.changes.title'), text: t('shell:whatsnew.highlights.changes.text') }
    case 'usage':
      return { title: t('shell:whatsnew.highlights.usage.title'), text: t('shell:whatsnew.highlights.usage.text') }
  }
}
