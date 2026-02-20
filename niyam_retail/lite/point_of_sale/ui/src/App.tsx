import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

const POSMainPage = lazy(() => import('./pages/POSMainPage'));

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('POS Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <pre className="text-left bg-white p-4 rounded-lg overflow-auto text-sm mb-4" style={{ maxHeight: '300px' }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-red-600 text-white rounded-lg"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'hsl(0 0% 100%)', color: 'hsl(222.2 84% 4.9%)' }}>
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p>Loading POS...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<LoadingScreen />}>
          <POSMainPage />
        </Suspense>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
