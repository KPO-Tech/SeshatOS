import type { ComponentType } from 'react'
import { BrandIcon } from '@renderer/components/plugins/catalog/BrandIcon'
import {
  Analysis, Book, BranchOne, Bug, Calendar, ChartHistogram, CloudStorage, Code, DatabaseNetwork, Edit, FilePdf, Folder, Globe, Key, Lightning, Magic,
  Mail, Microscope, Music, Pic, Robot, Rocket, SettingTwo, Shield, Star, Table, Terminal, Tool, Translate, Wallet
} from '@icon-park/react'
import type { SkillIconId } from './skillIcons'

type Glyph = ComponentType<{ theme?: 'outline' | 'filled'; size?: number | string; fill?: string }>

// An icon and the colour it is drawn in: warm and cool ones alternate, so that two skills side by side seldom look alike.
const GLYPHS: Record<SkillIconId, { glyph: Glyph; color: string }> = {
  git: { glyph: BranchOne, color: '#f0654a' },
  database: { glyph: DatabaseNetwork, color: '#4f8cf0' },
  data: { glyph: ChartHistogram, color: '#ef5b6c' },
  sheet: { glyph: Table, color: '#35b37a' },
  ai: { glyph: Analysis, color: '#a66cf0' },
  code: { glyph: Code, color: '#7a7cf0' },
  bug: { glyph: Bug, color: '#e8873a' },
  terminal: { glyph: Terminal, color: '#8aa0b8' },
  web: { glyph: Globe, color: '#2fb4d6' },
  cloud: { glyph: CloudStorage, color: '#5aa0f0' },
  deploy: { glyph: Rocket, color: '#ee7b3a' },
  files: { glyph: Folder, color: '#f08a3a' },
  pdf: { glyph: FilePdf, color: '#e5584f' },
  docs: { glyph: Edit, color: '#38b36f' },
  media: { glyph: Pic, color: '#e86aa6' },
  audio: { glyph: Music, color: '#c06af0' },
  mail: { glyph: Mail, color: '#4fa3e8' },
  calendar: { glyph: Calendar, color: '#e8a53a' },
  security: { glyph: Shield, color: '#3ab39a' },
  language: { glyph: Translate, color: '#5a8ff0' },
  finance: { glyph: Wallet, color: '#d9a62e' },
  science: { glyph: Microscope, color: '#38b0b3' },
  automation: { glyph: SettingTwo, color: '#f09a2e' },
  agent: { glyph: Robot, color: '#8a7cf0' },
  learn: { glyph: Book, color: '#6a9cf0' },
  bolt: { glyph: Lightning, color: '#f0b429' },
  magic: { glyph: Magic, color: '#c06af0' },
  tool: { glyph: Tool, color: '#7fa0b0' },
  star: { glyph: Star, color: '#f0b429' },
  key: { glyph: Key, color: '#e8873a' }
}

/** A skill's icon on a square of its own colour. */
export function SkillIconTile({ icon, size = 44 }: { icon: SkillIconId; size?: number }) {
  const { glyph: Glyph, color } = GLYPHS[icon]
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
      aria-hidden="true"
    >
      <Glyph theme="filled" size={Math.round(size * 0.52)} fill={color} />
    </span>
  )
}

/** The mark of a skill: the logo of the repository it comes from when it has one and the person chose no icon, else its icon. */
export function SkillMark({ icon, logo, title, size = 44 }: { icon: SkillIconId; logo?: string; title: string; size?: number }) {
  return logo ? <BrandIcon src={logo} title={title} size={size} /> : <SkillIconTile icon={icon} size={size} />
}
