import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VoucherEntryPage } from './pages/VoucherEntryPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <VoucherEntryPage />
      </div>
    </QueryClientProvider>
  );
}
