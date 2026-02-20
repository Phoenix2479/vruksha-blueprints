import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InventoryMainPage from './pages/InventoryMainPage'

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
      <InventoryMainPage />
    </QueryClientProvider>
  )
}

export default App
