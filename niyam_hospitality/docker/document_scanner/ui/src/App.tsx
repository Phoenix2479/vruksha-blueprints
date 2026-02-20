import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DocScannerPage from './pages/DocScannerPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><DocScannerPage /></QueryClientProvider>; }
export default App;
