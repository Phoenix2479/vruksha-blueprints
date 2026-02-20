import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BookingEnginePage from './pages/BookingEnginePage';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });

function App() {
  return <QueryClientProvider client={queryClient}><BookingEnginePage /></QueryClientProvider>;
}

export default App;
