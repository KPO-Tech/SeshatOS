import type { IconComponent } from './iconCatalog'

// IconPark has no plain database cylinder, only cylinders with a badge, so this one is drawn in its 48 unit outline style.
export const DatabaseIcon: IconComponent = ({ size = 16, fill = 'currentColor', strokeWidth = 3, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <ellipse cx="24" cy="11" rx="16" ry="6" />
    <path d="M8 11v26c0 3.3 7.2 6 16 6s16-2.7 16-6V11" />
    <path d="M8 24c0 3.3 7.2 6 16 6s16-2.7 16-6" />
  </svg>
)
