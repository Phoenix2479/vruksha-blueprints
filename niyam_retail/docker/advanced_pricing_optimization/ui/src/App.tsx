import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PricingOptimizerPage from './pages/PricingOptimizerPage';

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
    <QueryClientProvider client={queryClient}>
      <PricingOptimizerPage />
    </QueryClientProvider>
  );
}

export default App;
