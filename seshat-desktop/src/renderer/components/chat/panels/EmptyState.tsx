type Props = {
  title: string
  description: string
}

export function EmptyState({ title, description }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <h3 className="m-0 text-[var(--font-size-md)] font-bold text-app-text">{title}</h3>
      <p className="m-0 mt-2 max-w-[280px] text-[var(--font-size-sm)] leading-relaxed text-app-text-muted">{description}</p>
    </div>
  )
}
