import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RestaurantPOSPage from './pages/RestaurantPOSPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RestaurantPOSPage />
    </QueryClientProvider>
  );
}

export default App;
