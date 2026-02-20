import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChannelManagerPage from './pages/ChannelManagerPage';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30000 } } });
function App() { return <QueryClientProvider client={queryClient}><ChannelManagerPage /></QueryClientProvider>; }
export default App;
