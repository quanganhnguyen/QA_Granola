import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('App error:', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="app" style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 560 }}>
          <h2>Something went wrong</h2>
          <p style={{ color: '#666', marginTop: 8 }}>{this.state.error.message}</p>
          <p style={{ fontSize: 12, color: '#999', marginTop: 16 }}>
            Open DevTools (View → Toggle Developer Tools) to see the full error. You can copy the error message from the Console tab to report it.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 16, padding: '8px 16px' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
