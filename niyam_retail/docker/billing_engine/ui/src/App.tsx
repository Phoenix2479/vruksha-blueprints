import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

const BillingMainPage = lazy(() => import('./pages/BillingMainPage'));

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
    console.error('Billing Engine Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-red-50 text-red-800">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <pre className="text-left bg-white p-4 rounded-lg overflow-auto text-sm mb-4 max-h-[300px]">
              {this.state.error?.message}
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

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        }>
          <BillingMainPage />
        </Suspense>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
