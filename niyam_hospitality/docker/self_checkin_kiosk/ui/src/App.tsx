import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SelfCheckinPage from './pages/SelfCheckinPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><SelfCheckinPage /></QueryClientProvider>; }
export default App;
