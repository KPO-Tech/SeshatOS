import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-1 items-center justify-center bg-[var(--surface-root)] p-5">
          <div className="flex max-w-[480px] flex-col items-center gap-3 text-center">
            <p className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">Something went wrong</p>
            <pre className="m-0 w-full whitespace-pre-wrap break-words rounded-[5px] border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
              {import.meta.env.DEV && error.stack ? error.stack.split('\n').slice(0, 8).join('\n') : error.message}
            </pre>
            <button
              className="cursor-pointer rounded-[5px] border border-[var(--border-strong)] bg-[var(--surface-panel)] px-3.5 py-1.5 text-[11px] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[var(--surface-hover)]"
              onClick={this.reset}
              type="button"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
