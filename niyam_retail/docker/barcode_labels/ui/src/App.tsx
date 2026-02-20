import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BarcodeMainPage from './pages/BarcodeMainPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BarcodeMainPage />
    </QueryClientProvider>
  )
}

export default App
