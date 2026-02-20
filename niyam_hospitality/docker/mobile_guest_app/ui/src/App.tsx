import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MobileAdminPage from './pages/MobileAdminPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><MobileAdminPage /></QueryClientProvider>; }
export default App;
