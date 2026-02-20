import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MultiPropertyPage from './pages/MultiPropertyPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><MultiPropertyPage /></QueryClientProvider>; }
export default App;
