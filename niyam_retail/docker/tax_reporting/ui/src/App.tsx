import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TaxReportingPage from './pages/TaxReportingPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TaxReportingPage />
    </QueryClientProvider>
  );
}

export default App;
