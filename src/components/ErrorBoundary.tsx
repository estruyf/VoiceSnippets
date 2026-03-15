import React, { ReactNode } from "react"
import { AlertCircle } from "lucide-react"

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        this.props.fallback?.(this.state.error, this.resetError) || (
          <div className="rounded-md bg-destructive/15 border border-destructive/30 px-3 py-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Something went wrong</div>
              <div className="text-[10px] mt-0.5 opacity-75">{this.state.error.message}</div>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
