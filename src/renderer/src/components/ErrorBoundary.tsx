import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}
interface State {
  error: Error | null
  componentStack: string | null
}

// A real React error boundary. Previously a render throw anywhere under a route
// had NO boundary, so it either white-screened the app or (in Workspace) was
// masked by a redirect to the Dashboard — hiding the actual error. This catches
// render exceptions, logs the full error + component stack permanently, and
// shows a readable inline message instead of ever silently bouncing.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const tag = this.props.label ? `[ErrorBoundary ${this.props.label}]` : '[ErrorBoundary]'
    // Permanent logging — the actual exception must never be hidden again.
    console.error(`${tag} render error:`, error)
    console.error(`${tag} component stack:`, info.componentStack)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  private reset = (): void => this.setState({ error: null, componentStack: null })

  render(): ReactNode {
    const { error, componentStack } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex-1 flex items-center justify-center h-full p-6 overflow-auto">
        <div className="max-w-xl w-full text-center">
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">
            Something went wrong rendering this view
          </p>
          <p className="text-sm text-gray-600 dark:text-white/60 mt-2 break-words">
            {error.message || String(error)}
          </p>
          {(error.stack || componentStack) && (
            <pre className="mt-3 text-left text-[11px] leading-relaxed text-gray-500 dark:text-white/40 whitespace-pre-wrap break-words max-h-72 overflow-auto bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] rounded-lg p-3">
              {error.stack || ''}{componentStack || ''}
            </pre>
          )}
          <button
            onClick={this.reset}
            className="mt-4 px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
