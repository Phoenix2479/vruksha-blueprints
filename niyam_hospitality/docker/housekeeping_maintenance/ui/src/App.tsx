import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HousekeepingPage from './pages/HousekeepingPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HousekeepingPage />
    </QueryClientProvider>
  );
}

export default App;
