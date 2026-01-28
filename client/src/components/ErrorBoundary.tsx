import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error | null;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Uncaught error in React tree:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="app-error" style={{ padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <pre style={{ whiteSpace: 'pre-wrap', textAlign: 'left', maxWidth: 900, margin: '0 auto' }}>
            {String(this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error)}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
