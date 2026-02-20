import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PaymentsPage from './pages/PaymentsPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><PaymentsPage /></QueryClientProvider>; }
export default App;
