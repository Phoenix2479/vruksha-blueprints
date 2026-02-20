import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EcommerceMainPage from './pages/EcommerceMainPage'

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
      <EcommerceMainPage />
    </QueryClientProvider>
  )
}

export default App
