import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InventoryPage from './pages/InventoryPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <InventoryPage />
    </QueryClientProvider>
  );
}

export default App;
