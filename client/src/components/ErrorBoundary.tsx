import React from 'react';
import { isStaleChunkError, reloadForStaleChunk, hardRefresh } from '@/lib/staleChunkReload';

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
    // A page left open across a release can request a code file that was replaced.
    if (isStaleChunkError(error)) {
      if (reloadForStaleChunk()) return;
      // Already reloaded moments ago: the file is really missing, show the error.
      this.setState({ staleReloadFailed: true } as any);
    }
    console.error('Uncaught error in React tree:', error, info);
  }

  render() {
    if (this.state.hasError && isStaleChunkError(this.state.error)) {
      const failed = (this.state as any).staleReloadFailed;
      return (
        <div data-testid="app-updating" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center', fontFamily: 'inherit' }}>
          <div style={{ maxWidth: 320 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{failed ? 'KiyuMart has been updated' : 'Updating KiyuMart…'}</h1>
            {failed && (
              <>
                <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>Tap refresh to load the latest version.</p>
                <button type="button" onClick={hardRefresh} style={{ height: 44, padding: '0 24px', borderRadius: 999, border: 0, background: '#009688', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
              </>
            )}
          </div>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div data-testid="app-error" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ maxWidth: 360 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 16 }}>Please refresh the page. If it keeps happening, go back to the home page.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" onClick={hardRefresh} style={{ height: 44, padding: '0 20px', borderRadius: 999, border: 0, background: '#009688', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
              <button type="button" onClick={() => { window.location.href = '/'; }} style={{ height: 44, padding: '0 20px', borderRadius: 999, border: '1px solid #ccc', background: 'transparent', color: 'inherit', fontWeight: 600, cursor: 'pointer' }}>Home</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
