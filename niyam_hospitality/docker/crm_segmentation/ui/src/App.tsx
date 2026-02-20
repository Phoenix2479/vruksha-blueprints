import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CRMPage from './pages/CRMPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CRMPage />
    </QueryClientProvider>
  );
}

export default App;
