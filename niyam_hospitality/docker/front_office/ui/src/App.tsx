import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FrontOfficePage from './pages/FrontOfficePage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FrontOfficePage />
    </QueryClientProvider>
  );
}

export default App;
