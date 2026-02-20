import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoyaltyMainPage from './pages/LoyaltyMainPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LoyaltyMainPage />
    </QueryClientProvider>
  );
}

export default App;
