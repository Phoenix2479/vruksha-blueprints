import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AssetTrackerPage from './pages/AssetTrackerPage';
const queryClient = new QueryClient({defaultOptions:{queries:{staleTime:5*60*1000,retry:1}}});
export default function App(){return <QueryClientProvider client={queryClient}><AssetTrackerPage /></QueryClientProvider>;}
