import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ReturnsManagementPage from './pages/ReturnsManagementPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ReturnsManagementPage />
    </QueryClientProvider>
  );
}

export default App;
