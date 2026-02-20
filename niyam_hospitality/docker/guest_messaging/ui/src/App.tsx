import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessagingPage from './pages/MessagingPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MessagingPage />
    </QueryClientProvider>
  );
}

export default App;
