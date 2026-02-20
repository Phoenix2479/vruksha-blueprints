import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmailClientPage from './pages/EmailClientPage';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <EmailClientPage />
    </QueryClientProvider>
  );
}

export default App;
