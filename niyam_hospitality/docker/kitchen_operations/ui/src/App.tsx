import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import KitchenOpsPage from './pages/KitchenOpsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <KitchenOpsPage />
    </QueryClientProvider>
  );
}

export default App;
