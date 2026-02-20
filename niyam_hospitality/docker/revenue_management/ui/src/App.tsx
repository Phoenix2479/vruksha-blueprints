import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RevenueAIPage from './pages/RevenueAIPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><RevenueAIPage /></QueryClientProvider>; }
export default App;
