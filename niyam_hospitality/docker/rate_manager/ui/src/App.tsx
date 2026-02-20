import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RateManagerPage from './pages/RateManagerPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RateManagerPage />
    </QueryClientProvider>
  );
}

export default App;
