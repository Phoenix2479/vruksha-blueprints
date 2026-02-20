import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TravelAgentPage from './pages/TravelAgentPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><TravelAgentPage /></QueryClientProvider>; }
export default App;
