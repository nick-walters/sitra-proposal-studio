import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Catches uncaught render errors so the app shows a
 * recoverable message instead of a blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error("Uncaught error:", error, info);

    // A new deploy replaces the hashed chunk files, so a tab opened before the
    // deploy fails to fetch the module it was told to load. Reload once (guarded
    // by sessionStorage so a genuine failure can't loop) to pick up the new build.
    const message = String(error?.message ?? "");
    const isStaleChunk =
      /Failed to fetch dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message) ||
      /error loading dynamically imported module/i.test(message);
    if (isStaleChunk) {
      try {
        const KEY = "stale-chunk-reloaded";
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, "1");
          window.location.reload();
        }
      } catch {
        /* storage unavailable — fall through to the error screen */
      }
    }
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="flex justify-center">
              <AlertTriangle className="h-12 w-12 text-destructive" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. You can try again, or reload the page if the problem persists.
            </p>
            <pre className="text-left text-xs bg-muted p-3 rounded overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={this.handleReset}>Try again</Button>
              <Button onClick={this.handleReload}>Reload page</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
