import React from 'react';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';

interface RouteErrorBoundaryProps {
  route: string;
  resetKey: string;
  children: React.ReactNode;
}

interface RouteErrorBoundaryState {
  error: Error | null;
  diagnosticsId: string | null;
}

export class RouteErrorBoundary extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null, diagnosticsId: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return {
      error,
      diagnosticsId: `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[APEX] Route render failure', {
      route: this.props.route,
      diagnosticsId: this.state.diagnosticsId,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(previous: RouteErrorBoundaryProps) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, diagnosticsId: null });
    }
  }

  private retry = () => this.setState({ error: null, diagnosticsId: null });

  render() {
    if (!this.state.error) return this.props.children;
    const diagnostic = this.state.diagnosticsId ?? 'unavailable';
    return (
      <section className="apex-route-error" role="alert" aria-labelledby="apex-route-error-title">
        <AlertTriangle size={24} />
        <div>
          <span className="apex-eyebrow">Workspace recovery</span>
          <h1 id="apex-route-error-title">This workspace could not be rendered</h1>
          <p>The failure was isolated to {this.props.route}. Market and account secrets were not included in this diagnostic.</p>
          <code>{diagnostic}</code>
          <div>
            <button type="button" className="apex-primary-button" onClick={this.retry}><RefreshCw size={16} /> Retry workspace</button>
            <button type="button" className="apex-secondary-button" onClick={() => navigator.clipboard?.writeText(diagnostic)}><Copy size={16} /> Copy diagnostics ID</button>
          </div>
        </div>
      </section>
    );
  }
}
