import { CitationChip as Chip } from '@renderer/components/sources/CitationChip'
import type { Passage } from '../chat/knowledgeSearchResults'
import { kindOfFile, pagesLabel } from '../chat/passageSources'
import { FileKindIcon } from './FileKindIcon'
import { useTranslation } from 'react-i18next'

type Props = {
  passage: Passage
  onOpen: () => void
}

// A citation of an answer: the kind of file and the name of the document. Hovering it shows the passage and where it sits; clicking opens it.
export function CitationChip({ passage, onOpen }: Props) {
  const kind = kindOfFile(passage.file)
  const { t } = useTranslation('knowledge/components')
  const mark = (size: number) => <FileKindIcon kind={kind} size={size} />
  const title = passage.file || passage.collection
  const meta = [pagesLabel(passage.pages), passage.collection, passage.section].filter(Boolean)

  return (
    <Chip
      mark={mark(12)}
      label={title}
      onOpen={onOpen}
      preview={{ title, meta: meta.join(' · '), excerpt: excerptOf(passage.text), action: t('pages.knowledge.components.citationChip.openThePassage'), mark }}
    />
  )
}

// The start of the passage, for the preview: long enough to recognize it, short enough to read at a glance.
function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 260 ? `${flat.slice(0, 257).trimEnd()}...` : flat
}
