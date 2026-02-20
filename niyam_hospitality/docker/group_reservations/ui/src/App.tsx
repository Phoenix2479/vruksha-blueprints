import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupReservationsPage from './pages/GroupReservationsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GroupReservationsPage />
    </QueryClientProvider>
  );
}

export default App;
