import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

interface ErrorBoundaryState { error: Error | null }

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState { return { error }; }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(JSON.stringify({ message: "THREAD UI crashed", error: error.message, componentStack: info.componentStack }));
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-state">
        <img src="/thread-mark.svg" alt="" width="56" height="56" />
        <p className="eyebrow">RECOVERY MODE</p>
        <h1>The workspace hit an unexpected edge.</h1>
        <p>Your browser-local data is still preserved. Reload THREAD to recover the last valid snapshot.</p>
        <button className="primary-button" onClick={() => window.location.reload()}>Reload workspace</button>
      </main>
    );
  }
}
